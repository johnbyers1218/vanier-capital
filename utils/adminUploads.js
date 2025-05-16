// utils/adminUploads.js

import { v2 as cloudinary } from 'cloudinary';
import multer from 'multer';
import { logger } from '../config/logger.js';
import { logAdminAction } from './helpers.js'; // Assuming this is where your logAdminAction is



// --- Configure Multer (same as in your blog route, could be centralized later) ---
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Invalid file type. Only JPG, PNG, GIF, WEBP allowed for cover image.'), false);
    }
};

const coverImageUpload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: fileFilter
});


// --- Reusable Cloudinary Upload Handler for Cover Images ---
const handleCoverImageUpload = async (req, res, next, entityType = 'cover') => {
    if (!req.file) {
        logger.warn(`[${entityType} Cover Upload] No file object found. User: ${req.adminUser?.username}`);
        return res.status(400).json({ success: false, message: 'No image file received.' });
    }

    // Ensure Cloudinary is configured (this check should ideally be done once at app start,
    // but checking here too as a safeguard before direct Cloudinary interaction)
    if (!cloudinary.config().cloud_name || !cloudinary.config().api_key) {
        logger.error(`[${entityType} Cover Upload] Cloudinary not configured when upload route hit.`);
        return res.status(500).json({ success: false, message: 'Image storage is not configured on the server.' });
    }

    logger.info(`[${entityType} Cover Upload] Processing ${entityType} cover image: ${req.file.originalname}, User: ${req.adminUser.username}`);
    try {
        const uploadPromise = new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
                { folder: `fnd_automations_${entityType}_covers`, resource_type: "image" }, // e.g., fnd_automations_blog_covers
                (error, result) => {
                    if (error || !result?.secure_url) {
                        logger.error(`[${entityType} Cover Upload] Cloudinary Upload Error:`, error || 'Missing secure_url');
                        return reject(error || new Error('Cloudinary upload failed.'));
                    }
                    resolve(result);
                }
            );
            uploadStream.end(req.file.buffer);
        });

        const result = await uploadPromise;

        // Log admin action for cover image upload
        await logAdminAction(
            req.adminUser.userId,
            req.adminUser.username,
            `upload_${entityType}_cover_image`, // e.g., upload_blog_cover_image
            `File: ${req.file.originalname}, URL: ${result.secure_url}`,
            req.ip
        );
        logger.info(`[${entityType} Cover Upload] Image uploaded: ${result.secure_url}, User: ${req.adminUser.username}`);

        // Respond with success and the URL
        res.status(200).json({ success: true, message: `${entityType} cover image uploaded successfully.`, location: result.secure_url });

    } catch (error) {
        logger.error(`[${entityType} Cover Upload] Error during Cloudinary upload:`, { error: error.message });
        res.status(500).json({ success: false, message: `Server error during ${entityType} cover image upload: ${error.message}` });
    }
};

// Multer error handling middleware (can be attached after the route)
const handleMulterErrorForCoverImage = (error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        logger.warn(`[Cover Upload Multer Error] User: ${req.adminUser?.username}, Code: ${error.code} - ${error.message}`);
        return res.status(400).json({ success: false, message: `Cover image upload error: ${error.message}. Max 5MB.` });
    } else if (error) { // For errors from our fileFilter
        logger.warn(`[Cover Upload FileFilter Error] User: ${req.adminUser?.username}, Message: ${error.message}`);
        return res.status(400).json({ success: false, message: error.message || 'Invalid file type for cover image.' });
    }
    next(); // Should not be reached if error is handled
};


export { coverImageUpload, handleCoverImageUpload, handleMulterErrorForCoverImage };