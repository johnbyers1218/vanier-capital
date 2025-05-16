// routes/admin/adminAuth.js (ESM Version)

import express from "express";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit"; // For limiting login attempts
import AdminUser from "../../models/AdminUser.js"; // Default import, added .js
import { logger } from "../../config/logger.js"; // Named import, added .js
import bcrypt from "bcryptjs"; // Needed for dummy compare
import { logAdminAction } from '../../utils/helpers.js'; // <-- IMPORT logging helper

// This module exports a FUNCTION that accepts the csrfProtection middleware
export default (csrfProtection) => {
  const router = express.Router();

  // --- Rate Limiter for Login ---
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, max: 5,
    message: { message: "Too many login attempts..." },
    handler: (req, res, next, options) => {
      logger.warn(`Login rate limit exceeded for IP: ${req.ip}.`);
      req.flash("error", options.message.message);
      return res.redirect("/admin/login");
    },
    standardHeaders: true, legacyHeaders: false,
  });

  // --- Routes ---

  // GET /admin/login
  router.get("/login", csrfProtection, (req, res) => {
    const token = req.cookies.admin_token;
    if (token) {
      try {
        jwt.verify(token, process.env.JWT_SECRET);
        logger.debug(`GET /admin/login: Valid token, redirecting. IP: ${req.ip}`);
        return res.redirect("/admin/dashboard");
      } catch (err) {
        logger.debug(`GET /admin/login: Invalid token, clearing. IP: ${req.ip}`);
        res.clearCookie("admin_token");
      }
    }
    res.render("admin/login", {
      pageTitle: "Admin Login",
      csrfToken: req.csrfToken(),
      username: ""
    });
  });

  // POST /admin/login
  router.post( "/login", loginLimiter, csrfProtection, async (req, res, next) => {
      const { username, password } = req.body;
      if (!username || !password) {
        logger.warn(`Admin login missing fields. IP: ${req.ip}`);
        req.flash("error", "Username and password are required.");
        return res.redirect("/admin/login");
      }
      const lowerCaseUsername = username.toLowerCase().trim();

      try {
        const user = await AdminUser.findOne({ username: lowerCaseUsername });
        const dummyHash = process.env.DUMMY_HASH || "$2a$10$abcdefghijklmnopqrstuvwxzyABCDEFGHIJKL";
        let passwordMatch = false;
        let loginFailureReason = 'Invalid credentials'; // Default reason

        if (user) {
          if (user.isLocked()) {
            logger.warn(`Locked account login attempt: ${lowerCaseUsername}. IP: ${req.ip}`);
            const timeLeft = Math.ceil((user.lockUntil - Date.now()) / 60000);
            loginFailureReason = `Account locked (${timeLeft > 0 ? timeLeft : 1} min left)`;
            req.flash("error", `Account locked. Try again in ${timeLeft > 0 ? timeLeft : 1} min(s).`);
            // Log failed attempt BEFORE redirecting
            await logAdminAction('N/A', lowerCaseUsername, 'login_fail', loginFailureReason, req.ip); // <<< LOGGING ADDED
            return res.redirect("/admin/login");
          }
          passwordMatch = await user.comparePassword(password);
        } else {
          await bcrypt.compare(password, dummyHash);
          loginFailureReason = 'User not found';
          logger.warn(`Non-existent user login attempt: ${lowerCaseUsername}. IP: ${req.ip}`);
        }

        if (!passwordMatch) {
          if (user) {
            user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
            if (user.failedLoginAttempts >= 5) {
              user.lockUntil = Date.now() + 15 * 60 * 1000;
              loginFailureReason = 'Account locked (5+ fails)';
              logger.warn(`Account locked: ${lowerCaseUsername}. IP: ${req.ip}`);
              req.flash("error", "Account locked due to too many failed attempts.");
            } else {
              loginFailureReason = 'Invalid password'; // Update specific reason
              req.flash("error", "Invalid username or password.");
            }
            await user.save();
            logger.warn(`Failed login attempt for user: ${lowerCaseUsername}. Attempt ${user.failedLoginAttempts}. IP: ${req.ip}`);
          } else {
            req.flash("error", "Invalid username or password.");
          }
          // Log failed attempt BEFORE redirecting
          await logAdminAction(user ? user._id.toString() : 'N/A', lowerCaseUsername, 'login_fail', loginFailureReason, req.ip); // <<< LOGGING ADDED
          return res.redirect("/admin/login");
        }

        // --- Login Successful ---
        user.failedLoginAttempts = 0; user.lockUntil = null; user.lastLogin = new Date();
        await user.save();

        const payload = { userId: user._id.toString(), username: user.username, role: user.role };
        const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "2h" });

        const cookieOptions = {
          httpOnly: true, secure: process.env.NODE_ENV === "production",
          sameSite: "lax", // Using lax based on previous debugging
          maxAge: 1000 * 60 * 60 * 2
        };

        logger.debug("-----> Preparing to set admin_token cookie...");
        logger.debug("Token generated:", !!token);
        logger.debug("Cookie options:", cookieOptions);

        res.cookie("admin_token", token, cookieOptions);

        logger.debug("-----> admin_token cookie supposedly set.");

        // LOG SUCCESSFUL LOGIN ACTION *AFTER* setting cookie, before redirect
        await logAdminAction(user._id.toString(), user.username, 'login_success', '', req.ip); // <<< LOGGING ADDED

        logger.info(`Successful admin login: ${lowerCaseUsername}. IP: ${req.ip}`);
        res.redirect("/admin/dashboard");

      } catch (error) {
        logger.error("Server error during admin login:", { error: error.message, stack: error.stack, username: lowerCaseUsername, ip: req.ip });
        next(error); // Pass to global error handler
      }
    }
  );

  // GET /admin/logout
  router.get("/logout", async (req, res) => { // Made async
    const userId = req.adminUser?.userId || 'UnknownID';
    const username = req.adminUser?.username || 'UnknownUser';
    const ipAddress = req.ip;

    res.clearCookie("admin_token", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax", // Match setting options (using lax from above test)
    });

    // LOG LOGOUT ACTION
    try {
         await logAdminAction(userId, username, 'logout', '', ipAddress); // <<< LOGGING ADDED
         logger.info(`Admin user logged out: ${username}. IP: ${ipAddress}`);
    } catch(logError) {
         logger.error('Failed to log admin logout action:', logError);
    }

    req.flash("success", "You have been logged out successfully.");
    res.redirect("/admin/login");
  });

  return router;
}; // End export default function