/**
 * Vanier Capital - Frontend JavaScript (apps.js)
 *
 * Responsibilities:
 * - Initialize UI components on DOM load.
 * - Handle mobile navigation toggle.
 * - Highlight active navigation link based on URL.
 * - Fetch and display dynamic content (Properties) via API calls.
 * - Handle Contact form submission (via API).
 * - Trigger and handle Scheduling form submission (via API).
 * - Implement FAQ accordion functionality.
 * - Update dynamic elements like the copyright year.
 * - Provide basic utility functions (e.g., escapeHtml).
 */

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {


    // Initialize core UI components
    initSmartHeader();
    // Mobile nav toggle handled by inline script in footer.ejs (avoids double-bind)
    setActiveNavLink();
    initFAQAccordion();
    updateCopyrightYear();

    // Initialize dynamic content loading based on page elements
    if (document.getElementById('properties-grid-container')) {
        loadProperties(); // Load all projects on the /projects page
        initProjectFilters(); // Activate filter buttons if present
    }
    if (document.querySelector('.blog-filter-navigation')) {
        initBlogFilters(); // Activate blog filter buttons if present
    }
    if (document.getElementById('projects-preview-grid')) {
        loadProjectPreview(); // Load preview on the homepage /
    }

    // Initialize stat counters if stats are present on the page
    if (document.querySelector('.stat-number')) {
        initStatsCounter();
    }

    // Initialize form handlers if forms exist
    if (document.getElementById('contact-form')) {
        initContactAndScheduleForm();
    }
    
    // Schedule form is initialized dynamically after contact form success

    // Initialize newsletter form feedback if present
    initNewsletterForm();

    // Initialize Legal pages Table of Contents if present
    initLegalToc();
  
});

// Blur-up images: remove blur when loaded
document.addEventListener('DOMContentLoaded', () => {
    const imgs = document.querySelectorAll('img.blur-up');
    imgs.forEach(img => {
        if (img.complete) {
            img.classList.add('is-loaded');
        } else {
            img.addEventListener('load', () => img.classList.add('is-loaded'), { once: true });
            img.addEventListener('error', () => img.classList.add('is-loaded'), { once: true });
        }
    });
});


/**
 * CORRECT and SECURE HTML escaping utility.
 * Converts special HTML characters to their entity equivalents.
 * Handles quote characters correctly within replacement strings.
 * @param {string | number | any} unsafe The input string (or other type).
 * @returns {string} The escaped string.
 */
function escapeHtml(unsafe) {
    // Ensure input is treated as a string, handle null/undefined
    const str = String(unsafe || '');

    // Perform replacements in the correct order
    return str
         .replace(/&/g, "&")      // Replace & first
         .replace(/</g, "<")       // Then <
         .replace(/>/g, ">")       // Then >
         // Use single quotes to delimit the string containing "
         .replace(/"/g, '"')
         // Use double quotes to delimit the string containing '
         .replace(/'/g, "'");
 }
 
// Decode HTML entities (admin CMS content trusted)
function decodeHtmlEntities(str) {
    if (str == null) return '';
    const textarea = document.createElement('textarea');
    textarea.innerHTML = str;
    return textarea.value;
}
 

/**
 * Reusable fetch function with basic error handling.
 * @param {string} url API endpoint URL.
 * @param {object} options Fetch options (method, headers, body).
 * @returns {Promise<object>} Promise resolving to the parsed JSON data.
 */
async function fetchData(url, options = {}) {
    try {
        const response = await fetch(url, options);
        const responseData = await response.json(); // Always try to parse JSON

        if (!response.ok) {
            // Throw an error using message from API response if available
            throw new Error(responseData.message || `HTTP error! status: ${response.status}`);
        }
        if (!responseData.success) {
            // Throw an error if API indicates failure, include validation errors if present
            const errorMsg = responseData.message || 'API request failed.';
            const validationErrors = responseData.errors ? ` Details: ${responseData.errors.map(e => e.msg).join(', ')}` : '';
            throw new Error(errorMsg + validationErrors);
        }
        return responseData; // Return the full success response object (contains data property)

    } catch (error) {
        console.error(`Fetch error for ${url}:`, error);
        // Re-throw the processed error message or a generic one
        throw new Error(error.message || `Failed to fetch data from ${url}. Network error.`);
    }
}

/**
 * Updates the text content of an element safely.
 * @param {string} selector CSS selector for the target element.
 * @param {string} text Text content to set.
 */
function updateTextContent(selector, text) {
    const element = document.querySelector(selector);
    if (element) {
        element.textContent = text;
    } else {
         console.warn(`Element not found for selector: ${selector}`);
    }
}



// --- Navigation ---

function initMobileNav() {
    const hamburger = document.querySelector('.hamburger');
    const navLinks = document.querySelector('.nav-links');
    const body = document.body;

    if (!hamburger || !navLinks) return; // Exit if elements not found

    if (!navLinks.id) navLinks.id = 'nav-links-list';
    hamburger.setAttribute('aria-controls', navLinks.id);
    hamburger.setAttribute('aria-expanded', 'false'); // Initial state

    hamburger.addEventListener('click', () => {
        const isActive = navLinks.classList.toggle('active');
        hamburger.setAttribute('aria-expanded', isActive);
        body.classList.toggle('nav-active', isActive);
    });

    // Close menu when clicking a link inside it
    navLinks.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => {
            if (navLinks.classList.contains('active')) {
                navLinks.classList.remove('active');
                hamburger.setAttribute('aria-expanded', 'false');
                body.classList.remove('nav-active');
            }
            // Allow default link behavior to proceed
        });
    });
}

function setActiveNavLink() {
    const navLinks = document.querySelectorAll('.nav-links a, #main-header ul a, #mobile-nav a');
    // Get the path relative to the root (e.g., "/", "/about", "/blog")
    const currentPath = window.location.pathname;

    navLinks.forEach(link => {
        link.classList.remove('active'); // Reset all first
        let linkPath = link.getAttribute('href');

        // Handle potential leading/trailing slashes for comparison
        if (linkPath !== '/' && linkPath.endsWith('/')) {
            linkPath = linkPath.slice(0, -1);
        }
        const normalizedCurrentPath = currentPath.endsWith('/') && currentPath !== '/' ? currentPath.slice(0, -1) : currentPath;

        // Check for exact match or if current path starts with link path (for sections like blog)
        if (linkPath === normalizedCurrentPath || (linkPath !== '/' && normalizedCurrentPath.startsWith(linkPath) && (normalizedCurrentPath[linkPath.length] === '/' || normalizedCurrentPath.length === linkPath.length ))) {
            link.classList.add('active');
        }
    });
}

// --- Dynamic Content Rendering ---

/** Renders loading indicator into a grid container */
function renderLoadingIndicator(container) {
    container.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 3rem 1rem;">
            <i class="fas fa-spinner fa-spin fa-2x" style="color: var(--primary-color);"></i>
            <p style="margin-top: 1rem; color: var(--gray-text);">Loading Content...</p>
        </div>`;
}

/** Renders error message into a grid container */
function renderErrorMessage(container, message = 'Could not load content.') {
     container.innerHTML = `<p style="grid-column: 1 / -1; text-align: center; color: #dc3545; padding: 2rem; background-color: rgba(220, 53, 69, 0.1); border-radius: var(--border-radius);">${escapeHtml(message)}</p>`;
}

/** Renders "no data" message into a grid container */
function renderNoDataMessage(container, type = 'items') {
     container.innerHTML = `<p style="grid-column: 1 / -1; text-align: center; color: var(--gray-text); padding: 2rem;">No ${escapeHtml(type)} found.</p>`;
}

/**
 * Generates a plain text excerpt from HTML content.
 * @param {string} htmlContent The HTML string.
 *   @param {number} maxLength The maximum length of the excerpt.
 * @returns {string} A plain text excerpt.
 */
function generateExcerptFromHtml(htmlContent, maxLength = 150) {
    if (!htmlContent) return '';
    // Strip HTML tags
    const textContent = htmlContent.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    if (textContent.length <= maxLength) {
        return textContent;
    }
    // Truncate and add ellipsis
    return textContent.substring(0, maxLength).trimEnd() + '...';
}


/** Creates HTML for a single Project card (for listing pages) */
function createPropertyCardHtml(property, isPreview = false) {
    // Prefer explicit excerpt; fallback to generating from HTML description
    const excerptRaw = property.excerpt && String(property.excerpt).trim().length
        ? String(property.excerpt)
        : generateExcerptFromHtml(property.description, isPreview ? 80 : 120);
    const excerptHtml = decodeHtmlEntities(excerptRaw);

    const imageHtml = property.image
        ? `<img src="${escapeHtml(property.image)}" alt="${escapeHtml(property.title)}" loading="lazy" class="project-image">`
        : `<div class="project-image-placeholder">
             <i class="fas fa-building"></i>
           </div>`;

    // Link to the single property page using its slug
    const propertyDetailUrl = `/property/${escapeHtml(property.slug || 'no-slug-found')}`;
    // Properties might use propertyTypes or serviceTypes depending on API/Model evolution, check both or standardized 'serviceTypes'
    const tags = Array.isArray(property.serviceTypes) ? property.serviceTypes.map(s => s.name) : (property.category ? [property.category] : []);
    const tagChips = tags.map(n => `<span class="chip chip-muted">${escapeHtml(n)}</span>`).join('');

    // Entire card is clickable
    /** @todo Update CSS class 'project-card' to 'property-card' in stylesheet later */
    return `
    <a class="project-card" href="${propertyDetailUrl}" aria-label="View property: ${escapeHtml(property.title)}">
        ${imageHtml}
        <div class="project-content project-card-inner">
            <div class="project-card-top">
                <h3 class="project-title">${escapeHtml(property.title)}</h3>
                ${tagChips ? `<div class="project-meta">${tagChips}</div>` : ''}
                <div class="project-description project-description-rich">${excerptHtml}</div>
            </div>
            <div class="project-card-spacer"></div>
            <div class="project-meta project-cta">
                <span class="link-text">View Details <i class="fas fa-arrow-right"></i></span>
            </div>
        </div>
    </a>`;
}

// --- Loaders --- (loadProperties uses the updated createPropertyCardHtml)
async function loadProperties(page = 1, activeServiceIds = []) {
    const container = document.getElementById('properties-grid-container');
    if (!container) {
        console.warn('properties-grid-container not found on this page.');
        return;
    }
    
    renderLoadingIndicator(container);
    
    try {
        const params = new URLSearchParams();
        params.set('page', String(page));
        params.set('perPage', '9');
        (activeServiceIds || []).forEach(id => params.append('services', id));
        
        // Updated API Endpoint
        const data = await fetchData(`/api/properties?${params.toString()}`);
        
        if (data.properties && data.properties.length > 0) {
            container.innerHTML = ''; // Clear loading
            data.properties.forEach(property => {
                container.insertAdjacentHTML('beforeend', createPropertyCardHtml(property));
            });

            // Build curated dual filters (preloaded full lists from server)
            if (typeof buildDualProjectFiltersFromServer === 'function') {
                buildDualProjectFiltersFromServer(data.filters);
            }
            try { document.dispatchEvent(new CustomEvent('propertyFiltersUpdated')); } catch(_) {}
            
            if (typeof renderProjectsPagination === 'function') {
                renderProjectsPagination(data.pagination);
            }
        } else {
            renderNoDataMessage(container, 'properties');
            // Still render filters even if no properties on this page
            if (data && data.filters && typeof buildDualProjectFiltersFromServer === 'function') {
                buildDualProjectFiltersFromServer(data.filters);
                if (typeof renderProjectsPagination === 'function') renderProjectsPagination(data.pagination);
            }
        }
    } catch (error) {
        renderErrorMessage(container, `Could not load properties. ${error.message}`);
    }
}

// Human-friendly category label mapping
function formatCategoryLabel(slug) {
    if (!slug) return '';
    const s = String(slug).toLowerCase();
    const map = new Map([
        ['real-estate', 'Real Estate'],
        ['e-commerce', 'E‑Commerce'],
        ['ai', 'AI'],
        ['ml', 'Machine Learning'],
        ['machine-learning', 'Machine Learning'],
        ['data-engineering', 'Data Engineering'],
        ['automation', 'Automation'],
        ['finance', 'Finance'],
        ['healthcare', 'Healthcare'],
        ['logistics', 'Logistics'],
    ]);
    if (map.has(s)) return map.get(s);
    return s.replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// Human-friendly service label mapping
function formatServiceLabel(slug) {
    if (!slug) return '';
    const s = String(slug).toLowerCase();
    const map = new Map([
        ['ai-chatbots', 'AI Chatbots'],
        ['chatbots', 'AI Chatbots'],
        ['rpa_invoice_processing', 'Invoice Processing Automation'],
        ['invoice-processing', 'Invoice Processing Automation'],
        ['document-processing', 'Document Processing'],
        ['workflow-automation', 'Workflow Automation'],
        ['data-engineering', 'Data Engineering'],
        ['sales-automation', 'Sales Automation'],
        ['marketing-automation', 'Marketing Automation'],
        ['lead-enrichment', 'Lead Enrichment'],
        ['customer-support-automation', 'Customer Support Automation'],
    ]);
    if (map.has(s)) return map.get(s);
    return s.replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// createFeaturedProjectHtml needs to be updated to use an excerpt too if its description is HTML
function createFeaturedProjectHtml(project) {
    const projectDetailUrl = `/projects/${escapeHtml(project.slug)}`;
    const image = project.image
        ? `<img src="${escapeHtml(project.image)}" alt="${escapeHtml(project.title)}" loading="lazy">`
        : `<div class="featured-media-placeholder"><i class="fas fa-project-diagram fa-2x"></i></div>`;
    const rawExcerpt = project.excerpt ? String(project.excerpt) : generateExcerptFromHtml(project.description, 400);
    const truncated = rawExcerpt.length > 320 ? rawExcerpt.slice(0, 317) + '…' : rawExcerpt;
    const excerptHtml = decodeHtmlEntities(truncated);

    return `
        <div class="featured-card featured-card-compact" style="max-width:1080px;margin:0 auto;">
            <div class="featured-media">${image}</div>
            <div class="featured-body">
                ${categoryLabel ? `<div class="featured-category"><span class="pill">${escapeHtml(categoryLabel)}</span></div>` : ''}
                <h3 class="featured-title"><a href="${projectDetailUrl}" style="text-decoration:none;color:inherit;">${escapeHtml(project.title)}</a></h3>
                <div class="featured-excerpt featured-excerpt--clamp featured-excerpt-rich">${excerptHtml}</div>
                <div class="featured-actions"><a href="${projectDetailUrl}" class="cta-button primary-btn">View Case Study <span class="icon-arrow">&rarr;</span></a></div>
            </div>
        </div>`;
}


// Ensure your DOMContentLoaded listener calls loadProjects, loadFeaturedProject correctly.
document.addEventListener('DOMContentLoaded', () => {
  
    // Mobile nav toggle handled by inline script in footer.ejs
    setActiveNavLink();
    initFAQAccordion();
    updateCopyrightYear();

    if (document.getElementById('properties-grid-container')) {
        loadProperties();
        initProjectFilters();
    }
    if (document.getElementById('projects-preview-grid')) { // Homepage project preview
        // Ensure loadProjectPreview uses createProjectCardHtml which now links to slug
        loadProjectPreview(); // This function likely needs to use createProjectCardHtml with isPreview=true
    }
    if (document.getElementById('featured-project-container')) { // For /projects page featured
        loadFeaturedProject();
    }

    if (document.getElementById('contact-form'))initContactAndScheduleForm();
    // Vector world map disabled; rely on static SVG with overlay pins
    initMapModal();
    initStaticOverlayPins();
    // Schedule form is initialized dynamically
   
});
// --- Dynamic pins over static SVG map ---
function initStaticOverlayPins() {
    const wrap = document.getElementById('world-map-static-wrap');
    const overlay = document.getElementById('world-map-overlay');
    if (!wrap || !overlay) return;
    // Ensure proper stacking context
    wrap.style.position = wrap.style.position || 'relative';
    // Make the overlay interactive specifically for preview mode (tooltips + modal trigger)
    overlay.classList.add('is-interactive');
    overlay.style.pointerEvents = 'auto';
    overlay.style.zIndex = '2';
    overlay.style.cursor = 'pointer';
    // Crop view: show all continents while removing Antarctica only (bottom crop only)
    // Slightly crop the left to improve framing; bottom ~18% trims Antarctica but preserves Australia and southern tips
    // Then scale/translate so the visible window fills the wrapper with no inner padding
    // Restore original cropped framing (removes Antarctica & excess left margin) for static card preview
    const crop = { top: 0, right: 0, bottom: 18, left: 10 }; // percentages
    const clipPathCss = `inset(${crop.top}% ${crop.right}% ${crop.bottom}% ${crop.left}%)`;
    // IMPORTANT: do NOT apply clip/transform to the overlay SVG; only to the image.
    // Applying transforms to both causes double-scaling and pin drift. We'll compute
    // pin positions in wrapper coordinates with crop offsets baked in.
    // If we're only cropping the bottom, anchor scaling at the top so the top is not cut off
    const anchorTop = (crop.top === 0 && crop.bottom > 0); // anchor to top whenever we only remove from bottom (regardless of left/right)
    // When cropping only from the left, also anchor horizontally to the left to avoid empty space
    const anchorLeft = (crop.left > 0 && crop.right === 0);
    const anchorRight = (crop.right > 0 && crop.left === 0);
    // No overlay transform here
    // Forward clicks on overlay (pins or empty areas) to open the modal
    overlay.addEventListener('click', () => {
        const btn = document.getElementById('open-map-modal');
        if (btn && typeof btn.click === 'function') btn.click();
    });
    // Contain any scaled content within the card
    if (wrap && wrap.style) {
        wrap.style.overflow = 'hidden';
    }
    const img = wrap.querySelector('img.world-map-static');
    // Remove native title tooltip from the underlying button; keep aria-label for a11y
    const openBtn = document.getElementById('open-map-modal');
    if (openBtn) {
        if (openBtn.hasAttribute('title')) openBtn.removeAttribute('title');
    }
    // Overlay remains aria-hidden and purely interactive; button retains aria-label for screen readers

    // Create a lightweight tooltip used on hover (static preview only)
    let tooltip = wrap.querySelector('.map-overlay-tooltip');
    if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.className = 'map-overlay-tooltip';
        tooltip.style.position = 'absolute';
        tooltip.style.pointerEvents = 'none';
        tooltip.style.background = '#111827';
        tooltip.style.color = '#fff';
        tooltip.style.padding = '6px 8px';
        tooltip.style.borderRadius = '6px';
        tooltip.style.fontSize = '.8rem';
        tooltip.style.boxShadow = '0 6px 20px rgba(0,0,0,0.15)';
        tooltip.style.opacity = '0';
        tooltip.style.transform = 'translateY(-6px)';
        tooltip.style.transition = 'opacity 120ms ease, transform 120ms ease';
        wrap.appendChild(tooltip);
    }
    // Ensure tooltip appears above the SVG overlay (which uses z-index: 2)
    tooltip.style.zIndex = '3';

    // Add an on-map hint inviting users to explore the interactive map
    let hint = wrap.querySelector('.map-click-hint');
    if (!hint) {
        hint = document.createElement('div');
        hint.className = 'map-click-hint';
        hint.setAttribute('role', 'note');
        hint.textContent = 'Click the map to explore client locations';
        hint.style.position = 'absolute';
        hint.style.left = '12px';
        hint.style.bottom = '12px';
        hint.style.zIndex = '3';
        hint.style.background = 'rgba(17,24,39,0.80)';
        hint.style.color = '#fff';
        hint.style.fontSize = '.82rem';
        hint.style.padding = '6px 10px';
        hint.style.borderRadius = '999px';
        hint.style.userSelect = 'none';
        wrap.appendChild(hint);
    }

    // Fetch locations
    fetch('/api/clients/locations').then(r => r.ok ? r.json() : ({locations:[]})).then(data => {
        const points = normalizeAndGeocodeLocations((data && data.locations) || []).points;
        const kick = () => { renderPins(); let t; window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(renderPins, 120); }); };
        if (img && !img.complete) { img.addEventListener('load', kick, { once: true }); } else { kick(); }

    function renderPins() {
            // Measure rendered image box for accurate projection
            const wrapBox = wrap.getBoundingClientRect();
            // We'll use the wrapper's box as the overlay coordinate system.
            const w = Math.max(1, Math.floor(wrapBox.width));
            const h = Math.max(1, Math.floor(wrapBox.height));
            // Ensure the parent card doesn't enforce a large min-height (shrink to fit)
            try {
                const card = wrap.closest('.world-map-card');
                if (card) { card.style.minHeight = 'auto'; card.style.height = 'auto'; }
            } catch (_) { /* ignore */ }
            // Position overlay to exactly cover the wrapper (visible image window)
            const offsetLeft = 0;
            const offsetTop = 0;
            overlay.style.position = 'absolute';
            overlay.style.left = `${offsetLeft}px`;
            overlay.style.top = `${offsetTop}px`;
            overlay.style.width = `${w}px`;
            overlay.style.height = `${h}px`;
            overlay.setAttribute('viewBox', `0 0 ${w} ${h}`);
            overlay.setAttribute('width', String(w));
            overlay.setAttribute('height', String(h));
            overlay.innerHTML = '';
            // Apply clip/transform to the image only so the basemap is windowed
            if (img && img.style) {
                img.style.clipPath = clipPathCss;
                img.style.transformOrigin = anchorLeft ? 'left top' : (anchorRight ? 'right top' : (anchorTop ? 'center top' : 'center center'));
                {
                    const fracW = 1 - (crop.left + crop.right) / 100;
                    const fracH = 1 - (crop.top + crop.bottom) / 100;
                    const scaleX = fracW > 0 ? 1 / fracW : 1;
                    const scaleY = fracH > 0 ? 1 / fracH : 1;
                    const tx = anchorLeft ? -crop.left : (anchorRight ? crop.right : (crop.left - crop.right) / 2);
                    const ty = anchorTop ? 0 : (crop.top - crop.bottom) / 2;
                    img.style.transform = `translate(${tx}%, ${ty}%) scale(${scaleX}, ${scaleY})`;
                }
                img.style.display = 'block';
                img.style.width = '100%';
                // Fill wrapper height to avoid inner padding; wrapper overflow hides scaled overflow
                img.style.height = '100%';
                // Ensure the SVG basemap fully fills the image box so edges are flush with the container
                img.style.objectFit = 'fill';
            }
            // Choose projection based on the image's declared data-projection or auto-detect
            // Force Robinson to match the static basemap projection
            const projName = (img && img.dataset && img.dataset.projection) ? String(img.dataset.projection).toLowerCase() : 'robinson';
            const use = projName;

            // Projection helpers
            const toRad = d => d * Math.PI / 180;
            function robinsonProject(lon, lat, width, height) {
                // Table-driven Robinson forward projection (Snyder), 5° increments
                // Use independent horizontal and vertical scales so pins align even when the basemap is non-uniformly scaled
                const RX = [
                    0.8487,0.8470,0.8442,0.8423,0.8405,0.8386,0.8368,0.8349,0.8330,0.8311,
                    0.8293,0.8274,0.8256,0.8237,0.8218,0.8199,0.8180,0.8162,0.8143
                ];
                const RY = [
                    0.0000,0.0837,0.1671,0.2503,0.3333,0.4162,0.4990,0.5816,0.6642,0.7466,
                    0.8289,0.9110,0.9931,1.0750,1.1566,1.2379,1.3189,1.3994,1.4796
                ];
                const absLat = Math.abs(lat);
                const deg = Math.min(90, Math.max(0, absLat));
                const i = Math.min(18, Math.floor(deg / 5));
                const f = Math.min(1, Math.max(0, (deg - i * 5) / 5));
                const rx = i < 18 ? RX[i] + (RX[i + 1] - RX[i]) * f : RX[18];
                const ry = i < 18 ? RY[i] + (RY[i + 1] - RY[i]) * f : RY[18];
                // Independent scales: width maps to 2 * RX[0] * pi; height maps to 2 * max(RY)
                const maxRY = RY[18];
                const scaleX = width / (2 * RX[0] * Math.PI);
                const scaleY = height / (2 * maxRY);
                const x = scaleX * rx * toRad(lon);
                const y = scaleY * (lat < 0 ? -ry : ry);
                const cx = width / 2 + x;
                const cy = height / 2 - y;
                return [cx, cy];
            }

            function eqrectProject(lon, lat, width, height) {
                return [
                    (lon + 180) * (width / 360),
                    (90 - lat) * (height / 180)
                ];
            }

            const svgNS = 'http://www.w3.org/2000/svg';
            // Wrapper projection using Robinson on ORIGINAL canvas, then adjust for CROPPING only
            const g = document.createElementNS(svgNS, 'g');
            const original = { width: 2000, height: 1100 };

            // --- Affine projector from Robinson(original) -> WRAPPER pixels, fit to anchors measured on the visible map ---
            function invert3x3(m) {
                const [a,b,c,d,e,f,g,h,i] = [m[0][0],m[0][1],m[0][2], m[1][0],m[1][1],m[1][2], m[2][0],m[2][1],m[2][2]];
                const A =   e*i - f*h;
                const B = -(d*i - f*g);
                const C =   d*h - e*g;
                const D = -(b*i - c*h);
                const E =   a*i - c*g;
                const F = -(a*h - b*g);
                const G =   b*f - c*e;
                const H = -(a*f - c*d);
                const I =   a*e - b*d;
                const det = a*A + b*B + c*C;
                if (Math.abs(det) < 1e-9) return null;
                const invDet = 1/det;
                return [
                    [A*invDet, D*invDet, G*invDet],
                    [B*invDet, E*invDet, H*invDet],
                    [C*invDet, F*invDet, I*invDet]
                ];
            }

            function mul3x3vec3(m, v) { return [
                m[0][0]*v[0] + m[0][1]*v[1] + m[0][2]*v[2],
                m[1][0]*v[0] + m[1][1]*v[1] + m[1][2]*v[2],
                m[2][0]*v[0] + m[2][1]*v[1] + m[2][2]*v[2]
            ]; }

            function createAffineProjector(anchorDefs, originalSize) {
                // Build normal equations for least-squares affine fit: [xr, yr, 1] -> [Xw, Yw]
                let AtA = [[0,0,0],[0,0,0],[0,0,0]]; let AtX=[0,0,0]; let AtY=[0,0,0];
                for (const a of anchorDefs) {
                    const [xr, yr] = robinsonProject(a.geo.lon, a.geo.lat, originalSize.width, originalSize.height);
                    const v = [xr, yr, 1];
                    // accumulate AtA
                    AtA[0][0]+=v[0]*v[0]; AtA[0][1]+=v[0]*v[1]; AtA[0][2]+=v[0]*v[2];
                    AtA[1][0]+=v[1]*v[0]; AtA[1][1]+=v[1]*v[1]; AtA[1][2]+=v[1]*v[2];
                    AtA[2][0]+=v[2]*v[0]; AtA[2][1]+=v[2]*v[1]; AtA[2][2]+=v[2]*v[2];
                    // accumulate AtB for X, Y
                    AtX[0]+=v[0]*a.pixel.x; AtX[1]+=v[1]*a.pixel.x; AtX[2]+=v[2]*a.pixel.x;
                    AtY[0]+=v[0]*a.pixel.y; AtY[1]+=v[1]*a.pixel.y; AtY[2]+=v[2]*a.pixel.y;
                }
                const inv = invert3x3(AtA);
                if (!inv) {
                    // Fallback: no-op mapping; place everything at center
                    return { project: () => [w/2, h/2] };
                }
                const coeffX = mul3x3vec3(inv, AtX);
                const coeffY = mul3x3vec3(inv, AtY);
                return {
                    project: (lon, lat) => {
                        const [xr, yr] = robinsonProject(lon, lat, originalSize.width, originalSize.height);
                        const X = coeffX[0]*xr + coeffX[1]*yr + coeffX[2];
                        const Y = coeffY[0]*xr + coeffY[1]*yr + coeffY[2];
                        return [X, Y];
                    }
                };
            }

            // --- Anchor-based affine "triangulation" approach (robust against aspect scaling & cropping) ---
            const anchorGeoList = [
                { lon: -74.0060, lat: 40.7128 }, // NYC
                { lon: -80.1918, lat: 25.7617 }, // Miami
                { lon:  13.3615, lat: 38.1157 }, // Palermo
                { lon: -70.1823, lat: 42.0584 }, // Provincetown
                { lon:   8.9463, lat: 44.4056 }, // Genoa
                { lon:   2.3768, lat: 51.0344 }  // Dunkirk
            ];
            const anchorPixelsProvided = [
                { x: 289, y: 202 }, // NYC
                { x: 251, y: 272 }, // Miami
                { x: 590, y: 209 }, // Palermo
                { x: 303, y: 197 }, // Provincetown
                { x: 569, y: 187 }, // Genoa
                { x: 547, y: 157 }  // Dunkirk
            ];

            // Cache normalized anchor pixel ratios for responsiveness
            let norms = null;
            if (wrap.dataset.anchorNorms) {
                try { norms = JSON.parse(wrap.dataset.anchorNorms); } catch (_) { norms = null; }
            }
            if (!norms || norms.length !== anchorPixelsProvided.length) {
                norms = anchorPixelsProvided.map(p => ({ x: p.x / w, y: p.y / h }));
                wrap.dataset.anchorNorms = JSON.stringify(norms);
            }
            const anchorsForFit = anchorGeoList.map((geo, i) => ({ geo, pixel: { x: norms[i].x * w, y: norms[i].y * h } }));
            const projector = createAffineProjector(anchorsForFit, original);
            const projected = points.map(p => {
                let [x, y] = projector.project(p.lon, p.lat);
                // Keep very light normalization without large offsets; only tiny vertical tweak for readability
                const labelLower = (p.label || '').toLowerCase();
                if (labelLower.includes('new york, ny')) { y -= 0.5; }
                if (labelLower.includes('long island')) { y += 0.5; }
                return { p, x, y };
            });
            // Allow very close grouping so we can custom fan-out NYC vs Long Island
            const threshold = 5; // px
            const groups = [];
            projected.forEach(item => {
                let found = null;
                for (const grp of groups) {
                    const dx = item.x - grp.x;
                    const dy = item.y - grp.y;
                    if ((dx*dx + dy*dy) <= threshold*threshold) { found = grp; break; }
                }
                if (found) found.items.push(item); else groups.push({ x: item.x, y: item.y, items: [item] });
            });
        groups.forEach(grp => {
                const n = grp.items.length;
                // Custom compact layout for NYC + Long Island pair
                const labels = grp.items.map(i => (i.p.label||'').toLowerCase());
                const nycLI = labels.some(l=>l.includes('new york, ny')) && labels.some(l=>l.includes('long island')) && n <= 4;
                const r = n > 1 ? (nycLI ? 4 : 7) : 0;
                grp.items.forEach((item, idx) => {
                    let cx, cy;
                    if (n > 1) {
                        if (nycLI) {
                            // Arrange horizontally: NYC left, Long Island right, others (if any) fanned minimally
                            const ordered = [...grp.items].sort((a,b)=> (a.p.label||'').localeCompare(b.p.label||''));
                            const liIndex = ordered.findIndex(o=> (o.p.label||'').toLowerCase().includes('long island'));
                            const nycIndex = ordered.findIndex(o=> (o.p.label||'').toLowerCase().includes('new york, ny'));
                            const baseLeft = grp.x - 2;
                            const spacing = 4.5; // px
                            const mapPos = ordered.indexOf(item);
                            cx = baseLeft + mapPos * spacing;
                            cy = grp.y + (mapPos === nycIndex ? -1 : (mapPos === liIndex ? 1 : 0));
                        } else {
                            const angle = (idx / n) * Math.PI * 2;
                            cx = grp.x + r * Math.cos(angle);
                            cy = grp.y + r * Math.sin(angle);
                        }
                    } else { cx = item.x; cy = item.y; }
                    const c = document.createElementNS(svgNS, 'circle');
                    c.setAttribute('cx', String(cx));
                    c.setAttribute('cy', String(cy));
                    c.setAttribute('r', '6');
                    c.setAttribute('fill', '#0ea5e9');
                    c.setAttribute('stroke', '#0369a1');
                    c.setAttribute('stroke-width', '1');
                    // Native tooltip fallback for browsers (shows on hover even if custom tooltip CSS conflicts)
                    if (item.p.label) {
                        // Single custom tooltip system handles display; keep accessibility label only
                        c.setAttribute('aria-label', item.p.label);
                        c.setAttribute('role', 'img');
                    }
            // Ensure circles themselves can capture events even if parent styles change
            c.style.pointerEvents = 'auto';
                    c.addEventListener('mouseenter', () => {
                        tooltip.textContent = item.p.label || '';
                        tooltip.style.left = `${offsetLeft + cx + 10}px`;
                        tooltip.style.top = `${offsetTop + cy - 10}px`;
                        tooltip.style.opacity = '1';
                        tooltip.style.transform = 'translateY(-10px)';
                    });
                    c.addEventListener('mousemove', (e) => {
                        tooltip.style.left = `${e.clientX - wrapBox.left + 10}px`;
                        tooltip.style.top = `${e.clientY - wrapBox.top - 10}px`;
                    });
                    c.addEventListener('mouseleave', () => {
                        tooltip.style.opacity = '0';
                        tooltip.style.transform = 'translateY(-6px)';
                    });
            // Avoid opening modal when user clicks a pin intending to just hover
            c.addEventListener('click', (e) => { e.stopPropagation(); });
                    g.appendChild(c);
                });
            });
            overlay.appendChild(g);
        }
    }).catch(() => {/* ignore */});
}
// --- Modal interactive map (Leaflet on demand) ---
function initMapModal() {
    const openBtn = document.getElementById('open-map-modal');
    const modal = document.getElementById('map-modal');
    const closeBtn = document.getElementById('close-map-modal');
    if (!openBtn || !modal || !closeBtn) return;
    const backdrop = modal.querySelector('.map-backdrop');
    const container = document.getElementById('interactive-map');
    let mapInstance = null;
    function open() {
        modal.hidden = false; modal.setAttribute('aria-hidden', 'false');
        // Lazy-load Leaflet assets only when opened
        if (!mapInstance) {
            loadLeaflet().then(({ L }) => {
                mapInstance = L.map(container).setView([20, 0], 2);
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    attribution: '&copy; OpenStreetMap contributors'
                }).addTo(mapInstance);
                // Load client locations and plot markers, then fit bounds
                fetch('/api/clients/locations')
                    .then(r => r.ok ? r.json() : ({ locations: [] }))
                    .then(data => {
                        const pts = normalizeAndGeocodeLocations((data && data.locations) || []).points;
                        if (Array.isArray(pts) && pts.length) {
                            const latlngs = [];
                            pts.forEach(p => {
                                const m = L.circleMarker([p.lat, p.lon], {
                                    radius: 6, color: '#0369a1', weight: 1, fillColor: '#0ea5e9', fillOpacity: 0.9
                                }).addTo(mapInstance);
                                if (p.label) m.bindTooltip(p.label, { permanent: false, direction: 'top' });
                                latlngs.push([p.lat, p.lon]);
                            });
                            try {
                                const b = L.latLngBounds(latlngs);
                                mapInstance.fitBounds(b.pad(0.15), { animate: true, duration: 0.6 });
                            } catch (_) { /* ignore */ }
                        }
                    })
                    .catch(() => { /* ignore */ });
            }).catch(err => {
                console.error('Leaflet load error', err);
                // Graceful fallback: show the static SVG at large size in the modal
                container.innerHTML = '<img src="/images/world-map-robinson-ne.svg" alt="World map" style="width:100%;height:100%;object-fit:contain;display:block;"/>';
            });
        }
    }
    function close() { modal.setAttribute('aria-hidden','true'); modal.hidden = true; }

    openBtn.addEventListener('click', open);
    closeBtn.addEventListener('click', close);
    backdrop.addEventListener('click', close);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modal.getAttribute('aria-hidden') === 'false') close(); });
}

function loadLeaflet() {
    // Load Leaflet CSS and JS dynamically only when needed
    return new Promise((resolve, reject) => {
        if (window.L) return resolve({ L: window.L });
        const css = document.createElement('link');
        css.rel = 'stylesheet'; css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(css);
        const s = document.createElement('script');
        s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
        s.onload = () => resolve({ L: window.L });
        s.onerror = reject; document.head.appendChild(s);
    });
}

// --- World Map (minimal, dependency-free) ---
function initWorldMap() {
    const container = document.getElementById('world-map');
    if (!container || container.dataset.initialized === 'true') return;
    container.dataset.initialized = 'true';

    // Fetch locations and then render
    Promise.all([
        // Use plain fetch for resilience; handle non-200s gracefully
        fetch('/api/clients/locations').then(r => r.ok ? r.json() : ({ success:false, locations: [] })).catch(() => ({ success:false, locations: [] })),
        // Prefer TopoJSON (smaller) when available, then fallback to GeoJSON
        fetch('/js/world-topo.min.json').then(r => r.ok ? r.json() : null).catch(() => null),
        fetch('/js/world-geo.min.json').then(r => r.ok ? r.json() : null).catch(() => null)
    ])
        .then(([locResp, topo, geo]) => {
            let worldGeo = null;
            try {
                if (topo && topo.type === 'Topology') {
                    worldGeo = topoToGeoFeatureCollection(topo);
                }
            } catch (_) { /* ignore and fallback */ }
            if (!worldGeo && geo && geo.type) {
                worldGeo = geo;
            }
            const locations = (locResp && Array.isArray(locResp.locations)) ? locResp.locations : [];
            const { points, unknowns } = normalizeAndGeocodeLocations(locations);
            if (unknowns.length) console.warn('[WorldMap] Unknown locations (no coords):', unknowns);
            // Always pass world data if available; projection is driven by pin-bounds when pins exist.
            const worldForRender = worldGeo;
            // Initial render; if container hasn't laid out yet, defer slightly
            const doRender = () => renderWorldMap(container, points, worldForRender);
            const rect = container.getBoundingClientRect();
            if (!rect.width || rect.width < 10) {
                setTimeout(doRender, 100);
            } else {
                doRender();
            }

            // Re-render on window resize (debounced)
            let t;
            window.addEventListener('resize', () => {
                clearTimeout(t);
                t = setTimeout(doRender, 150);
            });

            // Re-render on container size changes (ResizeObserver) for layout shifts
            try {
                if (typeof ResizeObserver !== 'undefined') {
                    let roTimer;
                    const ro = new ResizeObserver(() => {
                        clearTimeout(roTimer);
                        roTimer = setTimeout(doRender, 120);
                    });
                    ro.observe(container);
                    container._worldMapRO = ro;
                }
            } catch (_) { /* ignore */ }
        })
        .catch(err => {
            console.error('[WorldMap] Failed to initialize map:', err);
            // Fallback: attempt to render empty map grid
            try {
                renderWorldMap(container, [], null);
            } catch (e) {
                container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#6b7280;">Map unavailable.</div>';
            }
        });
}

function normalizeAndGeocodeLocations(rawLocations) {
    const points = [];
    const unknowns = [];

    rawLocations.forEach(raw => {
        const loc = (raw || '').trim();
        if (!loc) return;
        const normalized = normalizeLocationString(loc);
        const p = getLatLonForLocation(normalized);
        if (p) {
            points.push({ label: p.label || loc, lat: p.lat, lon: p.lon, raw });
        } else {
            unknowns.push(loc);
        }
    });
    return { points, unknowns };
}

function normalizeLocationString(s) {
    let x = String(s).trim().replace(/\s+/g, ' ');
    // Common replacements
    x = x.replace(/\bU\.?S\.?A\b|\bU\.?S\.?\b|\bUnited States of America\b/i, 'United States');
    x = x.replace(/\bUK\b|\bU\.K\.\b|\bGreat Britain\b|\bBritain\b/i, 'United Kingdom');
    x = x.replace(/\bUAE\b|\bU\.A\.E\.\b|\bU\.A\.E\b|\bEmirates\b/i, 'United Arab Emirates');
    x = x.replace(/\bSF\b/i, 'San Francisco, CA, United States');
    x = x.replace(/\bNYC\b/i, 'New York, NY, United States');
    // Normalize full phrase "New York City" to canonical form so we never fall back to state centroid
    x = x.replace(/\bNew York City\b/i, 'New York, NY, United States');
    return x;
}

// Minimal coordinate lookup (countries, select states, and common cities)
const COUNTRY_CENTER = {
    'united states': { lat: 39.8, lon: -98.6 },
    'canada': { lat: 62.0, lon: -96.0 },
    'united kingdom': { lat: 55.0, lon: -3.2 },
    'australia': { lat: -25.3, lon: 133.8 },
    'germany': { lat: 51.2, lon: 10.4 },
    'france': { lat: 46.2, lon: 2.2 },
    'india': { lat: 22.3, lon: 78.5 },
    'singapore': { lat: 1.3521, lon: 103.8198 },
    'netherlands': { lat: 52.1, lon: 5.3 },
    'brazil': { lat: -14.2, lon: -51.9 },
    'mexico': { lat: 23.6, lon: -102.5 },
    'spain': { lat: 40.2, lon: -3.7 },
    'italy': { lat: 42.5, lon: 12.5 },
    'sweden': { lat: 60.1, lon: 18.6 },
    'norway': { lat: 60.5, lon: 8.5 },
    'denmark': { lat: 56.0, lon: 9.5 },
    'switzerland': { lat: 46.8, lon: 8.2 },
    'japan': { lat: 36.2, lon: 138.3 },
    'south korea': { lat: 36.5, lon: 127.9 },
    'united arab emirates': { lat: 24.3, lon: 54.4 },
    'israel': { lat: 31.0, lon: 35.0 },
    'south africa': { lat: -30.6, lon: 22.9 },
    'ireland': { lat: 53.2, lon: -8.1 },
    'portugal': { lat: 39.4, lon: -8.2 },
    'new zealand': { lat: -41.8, lon: 172.9 }
};

const US_STATE_CENTER = {
    'california': { lat: 36.7, lon: -119.4 },
    'texas': { lat: 31.0, lon: -100.0 },
    'florida': { lat: 28.0, lon: -82.0 },
    'new york': { lat: 42.9, lon: -75.5 },
    'illinois': { lat: 40.0, lon: -89.0 },
    'washington': { lat: 47.4, lon: -120.5 },
    'massachusetts': { lat: 42.2, lon: -71.8 },
    'colorado': { lat: 39.0, lon: -105.5 },
    'georgia': { lat: 32.6, lon: -83.4 },
    'pennsylvania': { lat: 40.9, lon: -77.8 },
    'ohio': { lat: 40.3, lon: -82.8 },
    'arizona': { lat: 34.2, lon: -111.7 },
    'north carolina': { lat: 35.5, lon: -80.0 },
    'virginia': { lat: 37.5, lon: -78.7 }
};

// Common state/province abbreviations → full name
const US_STATE_ABBR = {
    'al': 'alabama', 'ak': 'alaska', 'az': 'arizona', 'ar': 'arkansas', 'ca': 'california',
    'co': 'colorado', 'ct': 'connecticut', 'de': 'delaware', 'fl': 'florida', 'ga': 'georgia',
    'hi': 'hawaii', 'id': 'idaho', 'il': 'illinois', 'in': 'indiana', 'ia': 'iowa',
    'ks': 'kansas', 'ky': 'kentucky', 'la': 'louisiana', 'me': 'maine', 'md': 'maryland',
    'ma': 'massachusetts', 'mi': 'michigan', 'mn': 'minnesota', 'ms': 'mississippi', 'mo': 'missouri',
    'mt': 'montana', 'ne': 'nebraska', 'nv': 'nevada', 'nh': 'new hampshire', 'nj': 'new jersey',
    'nm': 'new mexico', 'ny': 'new york', 'nc': 'north carolina', 'nd': 'north dakota', 'oh': 'ohio',
    'ok': 'oklahoma', 'or': 'oregon', 'pa': 'pennsylvania', 'ri': 'rhode island', 'sc': 'south carolina',
    'sd': 'south dakota', 'tn': 'tennessee', 'tx': 'texas', 'ut': 'utah', 'vt': 'vermont',
    'va': 'virginia', 'wa': 'washington', 'wv': 'west virginia', 'wi': 'wisconsin', 'wy': 'wyoming'
};

const CA_PROV_ABBR = {
    'ab': 'alberta', 'bc': 'british columbia', 'mb': 'manitoba', 'nb': 'new brunswick', 'nl': 'newfoundland and labrador',
    'ns': 'nova scotia', 'nt': 'northwest territories', 'nu': 'nunavut', 'on': 'ontario', 'pe': 'prince edward island',
    'qc': 'quebec', 'sk': 'saskatchewan', 'yt': 'yukon'
};

const CITY_COORDS = {
    'new york, ny, united states': { lat: 40.7128, lon: -74.0060 },
    'long island, ny, united states': { lat: 40.7891, lon: -73.1350 },
    'long island, united states': { lat: 40.7891, lon: -73.1350 },
    'san francisco, ca, united states': { lat: 37.7749, lon: -122.4194 },
    'los angeles, ca, united states': { lat: 34.0522, lon: -118.2437 },
    'austin, tx, united states': { lat: 30.2672, lon: -97.7431 },
    'chicago, il, united states': { lat: 41.8781, lon: -87.6298 },
    'miami, fl, united states': { lat: 25.7617, lon: -80.1918 },
    'tampa, fl, united states': { lat: 27.9506, lon: -82.4572 },
    'tampa, united states': { lat: 27.9506, lon: -82.4572 },
    'seattle, wa, united states': { lat: 47.6062, lon: -122.3321 },
    'boston, ma, united states': { lat: 42.3601, lon: -71.0589 },
    'atlanta, ga, united states': { lat: 33.7490, lon: -84.3880 },
    'denver, co, united states': { lat: 39.7392, lon: -104.9903 },
    'dallas, tx, united states': { lat: 32.7767, lon: -96.7970 },
    'houston, tx, united states': { lat: 29.7604, lon: -95.3698 },
    'london, united kingdom': { lat: 51.5074, lon: -0.1278 },
    'toronto, canada': { lat: 43.6532, lon: -79.3832 },
    'kitchener, canada': { lat: 43.4516, lon: -80.4925 },
    'vancouver, canada': { lat: 49.2827, lon: -123.1207 },
    'montreal, canada': { lat: 45.5019, lon: -73.5674 },
    'calgary, canada': { lat: 51.0447, lon: -114.0719 },
    'ottawa, canada': { lat: 45.4215, lon: -75.6972 },
    'sydney, australia': { lat: -33.8688, lon: 151.2093 },
    'melbourne, australia': { lat: -37.8136, lon: 144.9631 },
    'singapore': { lat: 1.3521, lon: 103.8198 },
    'amsterdam, netherlands': { lat: 52.3676, lon: 4.9041 },
    'paris, france': { lat: 48.8566, lon: 2.3522 },
    'madrid, spain': { lat: 40.4168, lon: -3.7038 },
    'barcelona, spain': { lat: 41.3874, lon: 2.1686 },
    'berlin, germany': { lat: 52.5200, lon: 13.4050 },
    'munich, germany': { lat: 48.1351, lon: 11.5820 },
    'provincetown, ma, united states': { lat: 42.0584, lon: -70.1823 },
    'palermo, italy': { lat: 38.1157, lon: 13.3615 },
    'genoa, italy': { lat: 44.4056, lon: 8.9463 },
    'dunkirk, france': { lat: 51.0344, lon: 2.3768 },
    'rome, italy': { lat: 41.9028, lon: 12.4964 },
    'zurich, switzerland': { lat: 47.3769, lon: 8.5417 },
    'dubai, united arab emirates': { lat: 25.2048, lon: 55.2708 },
    'tel aviv, israel': { lat: 32.0853, lon: 34.7818 },
    'johannesburg, south africa': { lat: -26.2041, lon: 28.0473 },
    'dublin, ireland': { lat: 53.3498, lon: -6.2603 },
    'lisbon, portugal': { lat: 38.7223, lon: -9.1393 },
    'auckland, new zealand': { lat: -36.8485, lon: 174.7633 }
};

function getLatLonForLocation(locStr) {
    const s = String(locStr).trim();
    const lower = s.toLowerCase();

    // Try city exact
    if (CITY_COORDS[lower]) return { ...CITY_COORDS[lower], label: s };

    // Try patterns like "City, State, Country" or "City, Country"
    const parts = s.split(',').map(p => p.trim());
    if (parts.length >= 2) {
        const city = parts[0];
        let region = parts[1] || '';
        let country = parts.length >= 3 ? parts[2] : '';

        const cityLower = city.toLowerCase();
        let regionLower = region.toLowerCase();
        let countryLower = (country || '').toLowerCase();

        // Normalize country
        if (!countryLower && (US_STATE_ABBR[regionLower] || US_STATE_CENTER[regionLower])) countryLower = 'united states';
        if (!countryLower && CA_PROV_ABBR[regionLower]) countryLower = 'canada';

        // Expand region abbreviations to full names for state-center fallback
        const regionIsUSAbbr = US_STATE_ABBR[regionLower];
        const regionIsCAAbbr = CA_PROV_ABBR[regionLower];
        const regionFull = regionIsUSAbbr || regionIsCAAbbr || regionLower;

        // 1) Try CITY_COORDS with full string as provided (handles entries like "New York, NY, United States")
        const maybeCityCountry = `${cityLower}, ${[region, country].filter(Boolean).join(', ').toLowerCase()}`.replace(/, $/, '');
        if (CITY_COORDS[maybeCityCountry]) return { ...CITY_COORDS[maybeCityCountry], label: s };

        // Special handling for New York City variants to avoid falling back to the NY state center
        if ((cityLower === 'new york' || cityLower === 'new york city') &&
            (regionLower === 'new york' || regionLower === 'ny' || regionLower === '' || regionLower === 'new york city') &&
            (!countryLower || countryLower === 'united states')) {
            return { lat: 40.7128, lon: -74.0060, label: s };
        }

        // 2) Try city + country (ignoring region) if we have a country
        if (countryLower) {
            const keyCityCountry = `${cityLower}, ${countryLower}`;
            if (CITY_COORDS[keyCityCountry]) return { ...CITY_COORDS[keyCityCountry], label: s };
        }

        // 3) Try region/state center in US if region recognized
        if (US_STATE_CENTER[regionFull]) return { ...US_STATE_CENTER[regionFull], label: s };

        // 4) As a final hint, if region is US two-letter and we have city + abbr + country in dict
        if (regionIsUSAbbr && countryLower) {
            const keyCityStateAbbr = `${cityLower}, ${regionLower}, ${countryLower}`;
            if (CITY_COORDS[keyCityStateAbbr]) return { ...CITY_COORDS[keyCityStateAbbr], label: s };
        }
    }

    // Country-level fallback
    if (COUNTRY_CENTER[lower]) return { ...COUNTRY_CENTER[lower], label: s };

    return null; // unknown
}

function renderWorldMap(container, points, worldGeo) {
    const rect = container.getBoundingClientRect ? container.getBoundingClientRect() : { width: container.clientWidth, height: container.clientHeight };
    const width = Math.max(1, Math.floor(rect.width || container.clientWidth || 800));
    const height = Math.max(1, Math.floor(rect.height || container.clientHeight || 420));
    // Clear previous
    container.innerHTML = '';

    // Create SVG
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));
    svg.style.display = 'block';
    // Keep transparent to let CSS fallback image show through when needed
    svg.style.background = 'transparent';

    // --- Projection: prefer full-world when outline data is present so land is always visible ---
    // Auto-zoom to current pins if present; otherwise show a pleasant full-world frame
    const havePoints = Array.isArray(points) && points.length > 0;
    const bounds = havePoints
        ? computeLonLatBounds(points)
        : { minLon: -180, maxLon: 180, minLat: -60, maxLat: 80 };
    const project = makeProjection(bounds, width, height);

    // Removed grid underlay for a cleaner look

    if (worldGeo && worldGeo.features) {
    const landGroup = document.createElementNS(svgNS, 'g');
    // Softer styling when zoomed to pins to avoid edge artifacts; slightly richer when no pins.
    const fillColor = havePoints ? 'none' : '#bfdbfe';
    const strokeColor = havePoints ? '#93c5fd' : '#3b82f6';
    landGroup.setAttribute('fill', fillColor);
    landGroup.setAttribute('stroke', strokeColor);
    landGroup.setAttribute('stroke-width', havePoints ? '1' : '1.5');
    if (havePoints) {
        landGroup.setAttribute('stroke-opacity', '0.9');
        landGroup.setAttribute('stroke-linecap', 'round');
        landGroup.setAttribute('stroke-linejoin', 'round');
    } else {
        landGroup.setAttribute('opacity', '0.95');
    }

        // Convert GeoJSON coords (lon/lat) to SVG paths via dynamic equirectangular projection
        // and break segments that jump across the antimeridian to prevent tall vertical seams.
    const closeRings = !havePoints; // only close paths when filling (no points mode)
    const toPath = (coords) => coords
            .map(ring => {
                const parts = [];
                let d = '';
                let prevX = null;
                const seamJump = Math.max(40, width * 0.25); // threshold in px to detect wrap jumps
                for (let i = 0; i < ring.length; i++) {
                    const lon = ring[i][0];
                    const lat = ring[i][1];
                    const x = project.lon(lon);
                    const y = project.lat(lat);
                    const isBreak = prevX !== null && Math.abs(x - prevX) > seamJump;
                    if (isBreak) {
                        // close previous subpath only when filling; otherwise just push the open polyline
                        if (d) { parts.push(closeRings ? (d + ' Z') : d); d = ''; }
                        d = `M${x},${y}`; // start new subpath
                    } else if (!d) {
                        d = `M${x},${y}`;
                    } else {
                        d += ` L${x},${y}`;
                    }
                    prevX = x;
                }
                if (d) parts.push(closeRings ? (d + ' Z') : d);
                return parts.join(' ');
            })
            .join(' ');

        try {
            (worldGeo.features || []).forEach(feat => {
                const geom = feat.geometry || {};
                if (geom.type === 'Polygon') {
                    const d = toPath(geom.coordinates || []);
                    const path = document.createElementNS(svgNS, 'path');
                    path.setAttribute('d', d);
                    landGroup.appendChild(path);
                } else if (geom.type === 'MultiPolygon') {
                    (geom.coordinates || []).forEach(poly => {
                        const d = toPath(poly || []);
                        const path = document.createElementNS(svgNS, 'path');
                        path.setAttribute('d', d);
                        landGroup.appendChild(path);
                    });
                }
            });
            if (havePoints) {
                // Clip to current viewBox to avoid wrap seams at the edges
                const defs = document.createElementNS(svgNS, 'defs');
                const clip = document.createElementNS(svgNS, 'clipPath');
                const clipId = 'wm-clip';
                clip.setAttribute('id', clipId);
                const rect = document.createElementNS(svgNS, 'rect');
                rect.setAttribute('x', '0'); rect.setAttribute('y', '0');
                rect.setAttribute('width', String(width));
                rect.setAttribute('height', String(height));
                clip.appendChild(rect); defs.appendChild(clip);
                svg.appendChild(defs);
                landGroup.setAttribute('clip-path', `url(#${clipId})`);
            }
            svg.appendChild(landGroup);
        } catch (e) {
            console.warn('[WorldMap] Failed to render world outline, using built-in fallback:', e);
            renderFallbackWorld(svg, project, width, height);
        }
    } else if (!havePoints) {
        // Use built-in fallback outline only when no points are present
        renderFallbackWorld(svg, project, width, height);
    }

    // Tooltip div
    const tooltip = document.createElement('div');
    tooltip.style.position = 'absolute';
    tooltip.style.pointerEvents = 'none';
    tooltip.style.background = '#111827';
    tooltip.style.color = '#fff';
    tooltip.style.padding = '6px 8px';
    tooltip.style.borderRadius = '6px';
    tooltip.style.fontSize = '.8rem';
    tooltip.style.boxShadow = '0 6px 20px rgba(0,0,0,0.15)';
    tooltip.style.opacity = '0';
    tooltip.style.transform = 'translateY(-6px)';
    tooltip.style.transition = 'opacity 120ms ease, transform 120ms ease';
    container.style.position = 'relative';
    container.appendChild(tooltip);

    // Plot points with minimal overlap fan-out
    const dotGroup = document.createElementNS(svgNS, 'g');
    let delay = 0;
    const projected = points.map(p => ({ p, x: project.lon(p.lon), y: project.lat(p.lat) }));
    const threshold = 6; // px (was 10)
    const groups = [];
    projected.forEach(item => {
        let found = null;
        for (const grp of groups) {
            const dx = item.x - grp.x, dy = item.y - grp.y;
            if ((dx*dx + dy*dy) <= threshold*threshold) { found = grp; break; }
        }
        if (found) found.items.push(item); else groups.push({ x: item.x, y: item.y, items: [item] });
    });
    groups.forEach(grp => {
        const n = grp.items.length;
        const r = n > 1 ? 5 : 0; // smaller fan-out radius
        grp.items.forEach((item, idx) => {
            const cx = n > 1 ? grp.x + r * Math.cos((idx / n) * Math.PI * 2) : item.x;
            const cy = n > 1 ? grp.y + r * Math.sin((idx / n) * Math.PI * 2) : item.y;
            const circle = document.createElementNS(svgNS, 'circle');
            circle.setAttribute('cx', String(cx));
            circle.setAttribute('cy', String(cy));
            circle.setAttribute('r', '4.5');
            circle.setAttribute('fill', '#0ea5e9');
            circle.setAttribute('stroke', '#0369a1');
            circle.setAttribute('stroke-width', '1');
            circle.style.opacity = '0';
            circle.style.transition = 'opacity 300ms ease, transform 200ms ease';

            // Hover interactions
            circle.addEventListener('mouseenter', (e) => {
                circle.setAttribute('fill', '#22d3ee');
                tooltip.textContent = item.p.label;
                tooltip.style.left = `${cx + 10}px`;
                tooltip.style.top = `${cy - 10}px`;
                tooltip.style.opacity = '1';
                tooltip.style.transform = 'translateY(-10px)';
            });
            circle.addEventListener('mousemove', (e) => {
                const pt = getMouseSvgCoords(e, svg);
                tooltip.style.left = `${pt.x + 10}px`;
                tooltip.style.top = `${pt.y - 10}px`;
            });
            circle.addEventListener('mouseleave', () => {
                circle.setAttribute('fill', '#0ea5e9');
                tooltip.style.opacity = '0';
                tooltip.style.transform = 'translateY(-6px)';
            });

            dotGroup.appendChild(circle);
            setTimeout(() => { circle.style.opacity = '1'; }, delay);
            delay += 35; // staggered entrance
        });
    });
    svg.appendChild(dotGroup);

    container.appendChild(svg);

    // Add or update a small on-map badge showing total client count
    try {
        const id = 'world-map-client-count';
        let badge = container.querySelector(`#${id}`);
        const count = Array.isArray(points) ? points.length : 0;
        if (!badge) {
            badge = document.createElement('div');
            badge.id = id;
            badge.style.position = 'absolute';
            badge.style.top = '10px';
            badge.style.left = '10px';
            badge.style.background = 'rgba(17,24,39,0.85)';
            badge.style.color = '#fff';
            badge.style.padding = '6px 10px';
            badge.style.borderRadius = '999px';
            badge.style.fontSize = '.8rem';
            badge.style.lineHeight = '1';
            badge.style.boxShadow = '0 6px 20px rgba(0,0,0,0.2)';
            badge.style.userSelect = 'none';
            container.appendChild(badge);
        }
        badge.textContent = `${count} client${count === 1 ? '' : 's'}`;
    } catch (_) { /* ignore */ }
}

// Convert a minimal TopoJSON topology to a GeoJSON FeatureCollection (MultiPolygon only)
function topoToGeoFeatureCollection(topology) {
    const objects = topology.objects || {};
    const keys = Object.keys(objects);
    if (keys.length === 0) throw new Error('No objects in topology');
    // Find a MultiPolygon/Polygon object
    let obj = null;
    for (const k of keys) {
        const candidate = objects[k];
        if (candidate && (candidate.type === 'MultiPolygon' || candidate.type === 'Polygon' || candidate.geometries)) {
            obj = candidate; break;
        }
    }
    if (!obj) throw new Error('No suitable object in topology');

    const scale = topology.transform && topology.transform.scale ? topology.transform.scale : null;
    const translate = topology.transform && topology.transform.translate ? topology.transform.translate : null;
    const arcs = topology.arcs || [];

    // Decode an arc index into absolute lon/lat coordinates
    function decodeArc(idx) {
        const forward = idx >= 0;
        const arc = arcs[forward ? idx : ~idx];
        if (!arc) return [];
        let x = 0, y = 0;
        const pts = [];
        const iter = forward ? arc : [...arc].reverse();
        for (let i = 0; i < iter.length; i++) {
            let dx = iter[i][0];
            let dy = iter[i][1];
            // If transform provided, values are delta-encoded integers; otherwise assume absolute lon/lat
            if (scale && translate) {
                x += dx; y += dy;
                const lon = x * scale[0] + translate[0];
                const lat = y * scale[1] + translate[1];
                pts.push([lon, lat]);
            } else {
                // Treat as absolute lon/lat points
                pts.push([dx, dy]);
            }
        }
        return pts;
    }

    function decodePolygon(arcRings) {
        // arcRings: array of rings, each ring is array of arc indices
        return arcRings.map(ring => {
            const coords = [];
            ring.forEach((arcIdx, i) => {
                const segment = decodeArc(arcIdx);
                if (segment.length === 0) return;
                // Avoid duplicating the first point when concatenating arcs
                if (coords.length > 0 && segment.length > 0) segment.shift();
                coords.push(...segment);
            });
            return coords;
        });
    }

    let multi = [];
    if (obj.type === 'Polygon') {
        multi = [decodePolygon(obj.arcs)];
    } else if (obj.type === 'MultiPolygon') {
        multi = obj.arcs.map(poly => decodePolygon(poly));
    } else if (obj.geometries && Array.isArray(obj.geometries)) {
        obj.geometries.forEach(g => {
            if (g.type === 'Polygon') multi.push(decodePolygon(g.arcs));
            else if (g.type === 'MultiPolygon') multi.push(...g.arcs.map(poly => decodePolygon(poly)));
        });
    }

    return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'MultiPolygon', coordinates: multi } }] };
}

// Draw a very simplified world silhouette so the map is never blank
function renderFallbackWorld(svg, project, width, height) {
    const svgNS = 'http://www.w3.org/2000/svg';
    const land = document.createElementNS(svgNS, 'g');
    land.setAttribute('fill', '#c7e0ff');
    land.setAttribute('stroke', '#2563eb');
    land.setAttribute('stroke-width', '1.2');
    land.setAttribute('opacity', '0.95');

    // Minimal continent polygons (lon, lat) – intentionally coarse but recognizable
    const polys = [
        // North America
        [
            [-168, 72], [-130, 72], [-100, 65], [-80, 50], [-90, 30], [-100, 18], [-125, 20], [-160, 35], [-168, 55]
        ],
        // South America
        [
            [-82, 12], [-60, 10], [-50, -10], [-55, -30], [-60, -45], [-72, -50], [-80, -35]
        ],
        // Europe/Africa/West Asia
        [
            [-10, 72], [10, 68], [30, 62], [40, 50], [55, 40], [65, 30], [55, 20], [35, 15], [25, 5], [15, -5], [10, -20], [5, -35], [-5, -35], [-10, -5], [-10, 20], [-10, 40]
        ],
        // Asia (east)
        [
            [65, 55], [90, 50], [110, 45], [120, 35], [125, 25], [135, 35], [140, 45], [150, 50], [160, 55], [170, 60], [170, 45], [150, 35], [140, 25], [130, 15], [110, 20], [90, 25], [75, 35]
        ],
        // Africa (south part to connect visually)
        [
            [15, -5], [20, -15], [22, -25], [25, -35], [28, -32], [30, -25], [32, -15], [30, -5]
        ],
        // Australia
        [
            [112, -12], [155, -12], [155, -43], [114, -43]
        ]
    ];

    const toPath = (ring) => ring.map(([lon, lat], i) => `${i ? 'L' : 'M'}${project.lon(lon)},${project.lat(lat)}`).join(' ') + ' Z';
    polys.forEach(coords => {
        const p = document.createElementNS(svgNS, 'path');
        p.setAttribute('d', toPath(coords));
        land.appendChild(p);
    });
    svg.appendChild(land);
}

function appendGrid(svg, width, height, project, bounds) {
    const svgNS = 'http://www.w3.org/2000/svg';
    const gridGroup = document.createElementNS(svgNS, 'g');
    gridGroup.setAttribute('opacity', '0.45');
    const lonStart = bounds.minLon;
    const lonEnd = bounds.maxLon;
    const latStart = bounds.minLat;
    const latEnd = bounds.maxLat;
    const lonStep = niceDegreeStep(lonEnd - lonStart);
    const latStep = niceDegreeStep(latEnd - latStart, true);
    for (let lon = Math.ceil(lonStart / lonStep) * lonStep; lon <= lonEnd; lon += lonStep) {
        const x = project.lon(lon);
        const line = document.createElementNS(svgNS, 'line');
        line.setAttribute('x1', String(x));
        line.setAttribute('y1', '0');
        line.setAttribute('x2', String(x));
        line.setAttribute('y2', String(height));
        line.setAttribute('stroke', '#d1d5db');
        line.setAttribute('stroke-width', '1');
        gridGroup.appendChild(line);
    }
    for (let lat = Math.ceil(latStart / latStep) * latStep; lat <= latEnd; lat += latStep) {
        const y = project.lat(lat);
        const line = document.createElementNS(svgNS, 'line');
        line.setAttribute('x1', '0');
        line.setAttribute('y1', String(y));
        line.setAttribute('x2', String(width));
        line.setAttribute('y2', String(y));
        line.setAttribute('stroke', '#d1d5db');
        line.setAttribute('stroke-width', '1');
        gridGroup.appendChild(line);
    }
    svg.appendChild(gridGroup);
}

// Choose a pleasant grid step based on span (degrees)
function niceDegreeStep(span, isLat = false) {
    const abs = Math.max(1, Math.abs(span));
    if (abs <= 20) return isLat ? 5 : 10;
    if (abs <= 60) return isLat ? 10 : 15;
    if (abs <= 120) return isLat ? 15 : 30;
    return isLat ? 30 : 60;
}

function computeLonLatBounds(points) {
    if (!Array.isArray(points) || points.length === 0) {
        return { minLon: -180, maxLon: 180, minLat: -60, maxLat: 80 };
    }
    let minLon = 180, maxLon = -180, minLat = 90, maxLat = -90;
    points.forEach(p => {
        if (typeof p.lon === 'number') { minLon = Math.min(minLon, p.lon); maxLon = Math.max(maxLon, p.lon); }
        if (typeof p.lat === 'number') { minLat = Math.min(minLat, p.lat); maxLat = Math.max(maxLat, p.lat); }
    });
    // Add padding (tighter to emphasize current pins)
    const lonSpan = Math.max(8, (maxLon - minLon));
    const latSpan = Math.max(6, (maxLat - minLat));
    const lonPad = Math.max(4, lonSpan * 0.12);
    const latPad = Math.max(3, latSpan * 0.12);
    minLon = Math.max(-180, minLon - lonPad);
    maxLon = Math.min(180, maxLon + lonPad);
    minLat = Math.max(-85, minLat - latPad);
    maxLat = Math.min(85, maxLat + latPad);
    // Handle degenerate case (single point)
    if (!isFinite(lonSpan) || lonSpan < 1) { minLon = Math.max(-180, minLon - 5); maxLon = Math.min(180, maxLon + 5); }
    if (!isFinite(latSpan) || latSpan < 1) { minLat = Math.max(-85, minLat - 3); maxLat = Math.min(85, maxLat + 3); }
    return { minLon, maxLon, minLat, maxLat };
}

function makeProjection(bounds, width, height) {
    const lonSpan = (bounds.maxLon - bounds.minLon) || 1;
    const latSpan = (bounds.maxLat - bounds.minLat) || 1;
    return {
        lon: (lon) => (lon - bounds.minLon) * (width / lonSpan),
        lat: (lat) => (bounds.maxLat - lat) * (height / latSpan)
    };
}

function projectLon(lon, width) {
    // Equirectangular: map -180..180 to 0..width
    return (lon + 180) * (width / 360);
}
function projectLat(lat, height) {
    // Equirectangular: map 90..-90 to 0..height
    return (90 - lat) * (height / 180);
}

function getMouseSvgCoords(evt, svgEl) {
    const pt = svgEl.createSVGPoint();
    pt.x = evt.clientX; pt.y = evt.clientY;
    try {
        const ctm = svgEl.getScreenCTM().inverse();
        const sp = pt.matrixTransform(ctm);
        return { x: sp.x, y: sp.y };
    } catch (_) {
        return { x: evt.offsetX, y: evt.offsetY };
    }
}


// loadProjectPreview needs to correctly use createProjectCardHtml for the homepage preview
async function loadProjectPreview() {
    const container = document.getElementById('projects-preview-grid');
    if (!container) return;
    renderLoadingIndicator(container);
    try {
    const data = await fetchData('/api/projects?featured=true&perPage=3&page=1'); // Fetch featured, or just latest
        container.innerHTML = '';
        if (data.projects && data.projects.length > 0) {
            // Show only a few, e.g., 3. Ensure `isPubliclyVisible` is checked by API or here.
            const projectsToShow = data.projects.filter(p => p.isPubliclyVisible).slice(0, 3);
            projectsToShow.forEach(project => {
                // Pass true for isPreview to get shorter excerpt if desired
                container.insertAdjacentHTML('beforeend', createProjectCardHtml(project, true));
            });
          
        } else {
            renderNoDataMessage(container, 'projects');
        }
    } catch (error) {
        renderErrorMessage(container, `Could not load projects preview. ${error.message}`);
    }
}

// --- Loaders ---

async function loadGenericContent(apiPath, containerId, cardRenderer, typeName) {
    const container = document.getElementById(containerId);
    if (!container) {
        console.warn(`${typeName} container #${containerId} not found on this page.`);
        return;
    }
    renderLoadingIndicator(container);
    try {
        const data = await fetchData(apiPath);
        if (data[typeName] && data[typeName].length > 0) {
            container.innerHTML = ''; // Clear loading
            data[typeName].forEach(item => {
                container.insertAdjacentHTML('beforeend', cardRenderer(item));
            });
           
        } else {
            renderNoDataMessage(container, typeName);
        }
    } catch (error) {
        renderErrorMessage(container, `Could not load ${typeName}. ${error.message}`);
    }
}

// Stats Counter Animation
function initStatsCounter() {
    const statsNumbers = document.querySelectorAll('.stat-number');
    const observerOptions = {
        threshold: 0.5,
        rootMargin: '0px 0px -100px 0px'
    };
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const target = entry.target;
                if (target.dataset.animated === 'true') { return; }
                
                // Only animate if data-count is provided
                const countAttr = target.getAttribute('data-count');
                if (!countAttr) {
                    // If no data-count, just mark as animated so we don't check again, but don't change text
                    target.dataset.animated = 'true';
                    observer.unobserve(target);
                    return;
                }

                const finalValue = parseInt(countAttr) || 0;
                animateCounter(target, 0, finalValue, 2000);
                target.dataset.animated = 'true';
                observer.unobserve(target);
            }
        });
    }, observerOptions);
    
    statsNumbers.forEach(stat => {
        observer.observe(stat);
    });
}

function animateCounter(element, start, end, duration) {
    const increment = (end - start) / (duration / 16);
    let current = start;
    const suffix = element.getAttribute('data-suffix') || '';
    const prefix = element.getAttribute('data-prefix') || '';
    const timer = setInterval(() => {
        current += increment;
        if (current >= end) {
            current = end;
            clearInterval(timer);
        }
        const value = Math.floor(current).toLocaleString();
        element.textContent = `${prefix}${value}${suffix}`;
    }, 16);
}

// --- Project Filtering ---

function initProjectFilters() {
    const projectGrid = document.getElementById('properties-grid-container');
    if (!projectGrid) return;
    const serviceWrap = document.getElementById('service-filters');
    const pager = document.getElementById('projects-pagination');
    // Collapsible & search controls
    const svcToggle = document.getElementById('serviceToggle');
    const svcSearch = document.getElementById('serviceFilterSearch');

    function setCollapsed(el, toggle, collapsed){
        if (!el || !toggle) return;
        el.dataset.collapsed = collapsed ? 'true' : 'false';
        toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        toggle.textContent = collapsed ? 'Show more…' : 'Show less';
        el.style.maxHeight = collapsed ? '84px' : '9999px';
    }
    if (svcToggle && serviceWrap) svcToggle.addEventListener('click', ()=> setCollapsed(serviceWrap, svcToggle, serviceWrap.dataset.collapsed !== 'false'));

    function wireLiveSearch(input, container){
        if (!input || !container) return;
        input.addEventListener('input', ()=>{
            const q = input.value.trim().toLowerCase();
            container.querySelectorAll('.filter-btn').forEach(btn => {
                const label = (btn.querySelector('.filter-label')?.textContent || '').toLowerCase();
                const show = !q || label.includes(q);
                btn.style.display = show ? 'inline-flex' : 'none';
            });
        });
    }
    wireLiveSearch(svcSearch, serviceWrap);

    function adjustToggleVisibility(){
        const threshold = 84; // px; ~two rows
        if (serviceWrap && svcToggle) {
            const needs = serviceWrap.scrollHeight > threshold + 4;
            svcToggle.style.display = needs ? 'inline-block' : 'none';
            if (!needs) setCollapsed(serviceWrap, svcToggle, false);
        }
    }
    document.addEventListener('projectFiltersUpdated', adjustToggleVisibility);

    if (serviceWrap) {
        // Parse initial state from URL (deep-linking)
        const url = new URL(window.location.href);
        const pageQ = parseInt(url.searchParams.get('page') || '1', 10) || 1;
        const svcsQ = url.searchParams.getAll('services');
        window.__projFilterState = window.__projFilterState || { services: new Set(svcsQ), page: pageQ };
        const state = window.__projFilterState;

        function handleClick(e) {
            const btn = e.target.closest('.filter-btn');
            if (!btn) return;
            e.preventDefault();
            const id = btn.getAttribute('data-id');
            if (!id) return;
            if (btn.classList.contains('active')) {
                btn.classList.remove('active');
                state.services.delete(id);
                btn.setAttribute('aria-pressed', 'false');
            } else {
                btn.classList.add('active');
                state.services.add(id);
                btn.setAttribute('aria-pressed', 'true');
            }
            state.page = 1;
            // Sync URL (deep-linking)
            syncProjectsUrl(state);
            loadProperties(state.page, Array.from(state.services));
        }

        serviceWrap.addEventListener('click', handleClick);

        if (pager) {
            pager.addEventListener('click', (e) => {
                const a = e.target.closest('a[data-page]');
                if (!a) return;
                e.preventDefault();
                const nextPage = parseInt(a.getAttribute('data-page'), 10) || 1;
                if (a.classList.contains('disabled') || nextPage === state.page) return;
                state.page = nextPage;
                syncProjectsUrl(state);
                loadProperties(state.page, Array.from(state.services));
                // Scroll to grid top for better UX
                try { projectGrid.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch(_) { /* ignore */ }
            });
        }
        // Initial load honors deep-linked state
        setTimeout(() => {
            markActiveButtonsFromState(state);
            loadProjects(state.page, Array.from(state.services));
        }, 0);
        return; // done wiring curated mode
    }

    // No legacy single-group category fallback anymore
    return;
}

function updateFilterCounts() {
    const projectCards = document.querySelectorAll('.project-card');
    const filterButtons = document.querySelectorAll('#project-filters .filter-btn');
    
    // Count projects by category
    const categoryCounts = {};
    let totalCount = 0;

    projectCards.forEach(card => {
        const category = 'all';
        categoryCounts[category] = (categoryCounts[category] || 0) + 1;
        totalCount++;
    });

    // Update count displays
    filterButtons.forEach(button => {
        const filterValue = button.getAttribute('data-filter');
        const countElement = button.querySelector('.filter-count');
        
        if (countElement) {
            countElement.textContent = totalCount;
        }
    });
}

// filterProjects removed (legacy)

// --- Blog Filtering ---

function initBlogFilters() {
    const filterButtons = document.querySelectorAll('.blog-filter-navigation .filter-btn');
    const blogGrid = document.querySelector('.blog-list');
    const searchInput = document.querySelector('.blog-search #blogSearch');
    if (!filterButtons.length || !blogGrid) return;

    // Update filter counts on load
    updateBlogFilterCounts();

    // Respect server-selected category (from query param) if present; don't override existing classes, only ensure filtering is applied
    const nav = document.querySelector('.blog-filter-navigation');
    const currentCategory = nav?.getAttribute('data-current-category') || nav?.getAttribute('data-current-tag') || '';
    if (currentCategory) {
        const btn = document.querySelector(`.blog-filter-navigation .filter-btn[data-filter="${CSS.escape(currentCategory)}"]`);
        if (btn) {
            // Ensure ARIA state matches class without forcing reflow of classes
            filterButtons.forEach(b => b.setAttribute('aria-pressed', b === btn ? 'true' : 'false'));
            filterBlogPosts(currentCategory, searchInput ? searchInput.value.trim().toLowerCase() : '');
        }
    } else {
        // No tag query; ensure filtering runs with 'all' and ARIA reflects current active button
        const activeBtn = document.querySelector('.blog-filter-navigation .filter-btn.active') || document.querySelector('.blog-filter-navigation .filter-btn[data-filter="all"]');
        if (activeBtn) {
            filterButtons.forEach(b => b.setAttribute('aria-pressed', b === activeBtn ? 'true' : 'false'));
            filterBlogPosts(activeBtn.getAttribute('data-filter') || 'all', searchInput ? searchInput.value.trim().toLowerCase() : '');
        }
    }

    filterButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            e.preventDefault();
            const filterValue = button.getAttribute('data-filter');
            
            // Update active states
            filterButtons.forEach(btn => {
                btn.classList.remove('active');
                btn.setAttribute('aria-pressed', 'false');
            });
            button.classList.add('active');
            button.setAttribute('aria-pressed', 'true');

            // Filter blog posts with smooth animation & sync URL for deep-linking
            filterBlogPosts(filterValue, searchInput ? searchInput.value.trim().toLowerCase() : '');
            try {
                const url = new URL(window.location.href);
                if (filterValue && filterValue !== 'all') url.searchParams.set('category', filterValue); else url.searchParams.delete('category');
                window.history.replaceState(null, '', url.toString());
            } catch(_) { /* ignore */ }
        });
    });

    // Search input listener
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            const active = document.querySelector('.blog-filter-navigation .filter-btn.active');
            const filterValue = active ? active.getAttribute('data-filter') : 'all';
            filterBlogPosts(filterValue, searchInput.value.trim().toLowerCase());
        });
    }
}

function updateBlogFilterCounts() {
    const filterButtons = document.querySelectorAll('.blog-filter-navigation .filter-btn');
    if (!filterButtons.length) return;

    // If server rendered counts exist (numbers inside .filter-count), don't override them.
    const hasServerCounts = Array.from(filterButtons).some(btn => {
        const el = btn.querySelector('.filter-count');
        return el && /\d/.test(el.textContent);
    });

    if (hasServerCounts) return; // Trust server numbers

    // Fallback: compute from DOM if server didn't provide counts
    const blogCards = document.querySelectorAll('.blog-post-summary');
    const tagCounts = {};
    let totalCount = 0;

    blogCards.forEach(card => {
        const cats = card.dataset.categories ? card.dataset.categories.split(',').map(t => t.trim().toLowerCase()).filter(Boolean) : [];
        cats.forEach(slug => { if (slug) tagCounts[slug] = (tagCounts[slug] || 0) + 1; });
        totalCount++;
    });

    filterButtons.forEach(button => {
        const filterValue = button.getAttribute('data-filter');
        const countElement = button.querySelector('.filter-count');
        if (!countElement) return;
        if (filterValue === 'all') countElement.textContent = totalCount; else countElement.textContent = tagCounts[filterValue] || 0;
    });
}

function filterBlogPosts(filterValue, searchTerm = '') {
    const blogCards = document.querySelectorAll('.blog-post-summary');
    
    blogCards.forEach((card, index) => {
    const tags = card.dataset.categories ? card.dataset.categories.split(',') : [];
    // Search matches title text
    const titleEl = card.querySelector('.blog-post-summary-title');
    const textContent = titleEl ? titleEl.textContent.toLowerCase() : '';
    const matchesSearch = !searchTerm || textContent.includes(searchTerm);
    const matchesTag = (filterValue === 'all' || tags.includes(filterValue));
    const shouldShow = matchesTag && matchesSearch;
        
        if (shouldShow) {
            card.style.display = 'flex';
            card.style.animation = `fadeInUp 0.6s ease forwards ${index * 0.1}s`;
        } else {
            card.style.animation = 'fadeOut 0.3s ease forwards';
            setTimeout(() => {
                if (!shouldShow) card.style.display = 'none';
            }, 300);
        }
    });
}


// --- Form Handling ---
function displayStatusMessage(containerId, message, isSuccess = true) {
    const container = document.getElementById(containerId);
    if (container) {
        const messageType = isSuccess ? 'success' : 'error';
        // Using a checkmark or exclamation icon via class, assuming CSS handles the icon
        const iconHtml = isSuccess ? '<i class="fas fa-check-circle"></i>' : '<i class="fas fa-exclamation-circle"></i>';
        container.innerHTML = `<div class="flash-message ${messageType}" style="display: flex; align-items: center; gap: 10px;">${iconHtml} <span>${escapeHtml(message)}</span></div>`;
        // Auto-clear after a delay - REMOVE FOR DEBUGGING if it clears too fast
        // setTimeout(() => { if(container) container.innerHTML = ''; }, 7000);
    } else {
         console.warn(`Message container #${containerId} not found.`);
    }
}



function clearFieldErrors() {
    document.querySelectorAll('.field-error-message').forEach(el => el.remove());
    document.querySelectorAll('.form-group input.error, .form-group textarea.error, .form-group select.error')
        .forEach(el => el.classList.remove('error'));
}

/**
 * Displays individual field validation errors.
 * @param {Array} errors - The array of error objects from the server.
 */
function displayFieldErrors(errors) {
    clearFieldErrors(); // Clear previous field errors

    if (errors && Array.isArray(errors)) {
        errors.forEach(err => {
            const fieldName = err.path; // 'path' usually holds the field name
            const inputElement = document.querySelector(`[name="${fieldName}"]`);
            if (inputElement) {
                inputElement.classList.add('error'); // Add error class for styling input
                const errorMsgElement = document.createElement('small');
                errorMsgElement.className = 'field-error-message';
                errorMsgElement.style.color = 'var(--danger-color)'; // Or use a CSS class
                errorMsgElement.style.display = 'block';
                errorMsgElement.style.marginTop = '4px';
                errorMsgElement.textContent = err.msg;

                // Insert after the input element, or after its parent .form-group if more appropriate
                if (inputElement.parentNode && inputElement.parentNode.classList.contains('form-group')) {
                    inputElement.parentNode.appendChild(errorMsgElement);
                } else {
                    inputElement.insertAdjacentElement('afterend', errorMsgElement);
                }
            } else {
                console.warn(`Could not find input element for field: ${fieldName} to display error: ${err.msg}`);
            }
        });
    }
}


function initContactAndScheduleForm() {
    const mainForm = document.getElementById('contact-form');
    const submitButton = mainForm?.querySelector('button[type="submit"]'); // Ensure your button has type="submit"
    const messageContainer = document.getElementById('contact-form-message');
  


    if (!mainForm || !submitButton || !messageContainer ) {
        console.warn('Main contact form or one of its critical elements/containers not found. Form not initialized.', {
            mainFormExists: !!mainForm,
            submitButtonExists: !!submitButton,
            messageContainerExists: !!messageContainer,
        });
        return;
    }

    // Prevent double-initialization (can occur due to multiple DOMContentLoaded hooks)
    if (mainForm.getAttribute('data-initialized') === '1') {
        return;
    }
    mainForm.setAttribute('data-initialized', '1');

    const originalButtonHtml = submitButton.innerHTML;


    // Main form submission handler
    mainForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        if (submitButton.disabled) {
            return;
        }

        submitButton.disabled = true;
        submitButton.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Sending...`;
        displayStatusMessage('contact-form-message', ''); // Clear previous general messages
        clearFieldErrors(); // Clear previous individual field errors

        const formData = new FormData(mainForm);
        const formObject = Object.fromEntries(formData.entries());
        // Backward compatibility: if name was present, split it; else use firstName/lastName
        if (!formObject.firstName && !formObject.lastName && formObject.name) {
            const parts = String(formObject.name).trim().split(/\s+/);
            formObject.firstName = parts.shift() || '';
            formObject.lastName = parts.join(' ');
        }

    // Explicitly get checkbox values
        const privacyCheckbox = document.getElementById('privacy');
        formObject.privacy = privacyCheckbox ? (privacyCheckbox.checked ? 'on' : 'off') : 'off';
    // Optional hidden flag for scheduling path; default to false if not present
    const hiddenRequestedMeetingInput = document.getElementById('requestedMeeting');
    formObject.requestedMeeting = hiddenRequestedMeetingInput ? (hiddenRequestedMeetingInput.value === 'true') : false;


        let dataFromApi; // To store API response for use in finally block

        try {
            // NOTE: Public contact form now handled by /api/contact (not /api/contact-submission)
            dataFromApi = await fetchData('/api/contact', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
                body: JSON.stringify(formObject)
            });

            if (dataFromApi.success) {
                displayStatusMessage('contact-form-message', dataFromApi.message, true);
                mainForm.reset(); // Reset all fields in the form

                // Success message stays visible for a while
                setTimeout(() => {
                    if (document.getElementById('contact-form-message') &&
                        document.getElementById('contact-form-message').querySelector('.success')) { // Only clear if it's a success message
                        // displayStatusMessage('contact-form-message', ''); // Optionally clear global success
                    }
                }, 7000); // Message visible for 7 seconds
            } else {
                // Display general error message at the top
                displayStatusMessage('contact-form-message', dataFromApi.message || 'Please correct the errors below.', false);
                // Display individual field errors
                if (dataFromApi.errors) {
                    displayFieldErrors(dataFromApi.errors);
                }
            }
        } catch (error) {
            console.error('Error submitting combined form:', error);
            displayStatusMessage('contact-form-message', error.message || 'An unexpected error occurred. Please try again.', false);
            // In case of a network error or fetchData throwing before 'dataFromApi' is set
            dataFromApi = { success: false }; // Assume failure for the finally block
        } finally {
            // Reset button based on the outcome
            const wasSuccessful = dataFromApi && dataFromApi.success;
            if (!wasSuccessful) {
                // If there was an error or API returned success: false, re-enable immediately
                submitButton.disabled = false;
                submitButton.innerHTML = originalButtonHtml;
            } else {
                // If successful, form is reset. Re-enable button after a short delay
                // so user can submit again if they wish (e.g., for a different inquiry)
                setTimeout(() => {
                    if (submitButton && document.body.contains(submitButton)) { // Check if button still exists
                        submitButton.disabled = false;
                        submitButton.innerHTML = originalButtonHtml;
                    }
                }, 1000); // Delay of 1 second
            }
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    // ...
    if (document.getElementById('contact-form')) {
        initContactAndScheduleForm(); // Call the new combined function
    }
    // ...
});







/** Fetches and renders the single featured project */
async function loadFeaturedProject() {
    const container = document.getElementById('featured-project-container'); // Target new ID
    if (!container) return;
    container.innerHTML = '<p style="text-align: center; padding: 1rem; color: var(--gray-text);">Loading featured project...</p>'; // Simple loading state

    try {
        // Fetch only the featured project, perPage 1
        const data = await fetchData('/api/projects?featured=true&perPage=1&page=1');

        if (data.projects && data.projects.length > 0) {
            const featuredProject = data.projects[0];
            container.innerHTML = createFeaturedProjectHtml(featuredProject); // Use a dedicated rendering function
        } else {
            // Optional: Hide the section or show a 'no featured' message
            container.innerHTML = ''; // Clear loading message
            // container.style.display = 'none'; // Hide section if no featured item
          
        }
    } catch (error) {
         container.innerHTML = `<p style="text-align: center; color: var(--danger-color);">Error loading featured project.</p>`;
    }
}

function initScheduleForm() {
    const scheduleForm = document.getElementById('schedule-form');
    // ... (other setup) ...

    scheduleForm.addEventListener('submit', async (e) => {
        // ... (prevent default, button disabling) ...
        displayStatusMessage('schedule-message', '');
        // ... (formData and validation) ...

        try {
            const data = await fetchData('/api/schedule-meeting', { /* ... */ });

            // UPDATED Success handling for scheduling form
            displayStatusMessage('schedule-message', data.message || 'Meeting request received! We will email you to confirm.', true);
            scheduleForm.reset();
            scheduleForm.style.display = 'none';

            const scheduleContainer = document.getElementById('schedule-section');
            if(scheduleContainer) {
                 const thankYouMsgContainer = document.createElement('div');
                 thankYouMsgContainer.setAttribute('id', 'schedule-thank-you');
                 thankYouMsgContainer.style.textAlign = 'center'; // ... (other styling) ...
                 const thankYouP = document.createElement('p');
                 thankYouP.innerHTML = `${escapeHtml(data.message)}<br><br>Please keep an eye on your inbox.`; // Use API message
                 thankYouP.style.color = 'var(--light-text)';
                 thankYouMsgContainer.prepend(thankYouP);
                 // Remove previous thank you message if exists to prevent duplicates
                 const existingThankYou = document.getElementById('schedule-thank-you');
                 if (existingThankYou) existingThankYou.remove();
                 scheduleContainer.appendChild(thankYouMsgContainer);
            }
        } catch (error) { /* ... */ }
        // ... (button re-enabling on error) ...
    });

}

// --- FAQ Accordion ---

// Global flag to prevent multiple FAQ initializations
window.faqInitialized = window.faqInitialized || false;

function initFAQAccordion() {
    if (window.faqInitialized) {
        return;
    }
    
    
    // Clear any existing FAQ handlers
    const existingFaqItems = document.querySelectorAll('.faq-item');
    existingFaqItems.forEach(item => {
        const question = item.querySelector('.faq-question');
        if (question) {
            // Remove all event listeners by replacing the element
            const clone = question.cloneNode(true);
            question.parentNode.replaceChild(clone, question);
        }
    });
    
    const faqItems = document.querySelectorAll('.faq-item');
    
    if (!faqItems.length) {
        console.warn('FAQ Accordion: No FAQ items found');
        return;
    }

    faqItems.forEach((item, index) => {
        const question = item.querySelector('.faq-question');
        const answer = item.querySelector('.faq-answer');

        if (!question || !answer) {
            console.warn(`FAQ ${index + 1}: Missing question or answer element`);
            return;
        }

        // Set unique IDs for accessibility
        const answerId = `faq-answer-${index + 1}`;
        answer.id = answerId;
        question.setAttribute('aria-controls', answerId);
        question.setAttribute('aria-expanded', 'false');
        question.setAttribute('tabindex', '0');
        question.setAttribute('role', 'button');
        
        // Mark as initialized to prevent double initialization
        question.dataset.faqInitialized = 'true';

    // Initialize CSS (force closed)
    item.classList.remove('is-open');
    answer.style.overflow = 'hidden';
    // We'll animate max-height and then set it to 'none' when opened so content isn't clipped
    answer.style.transition = 'max-height 0.3s ease, padding 0.2s ease';
    answer.style.maxHeight = '0px';

        // When the open transition ends, clear the max-height so it auto-sizes to content
        answer.addEventListener('transitionend', (ev) => {
            if (ev.propertyName === 'max-height' && item.classList.contains('is-open')) {
                // Allow natural height after animation completes
                answer.style.maxHeight = 'none';
            }
        });

        // Toggle function with state tracking
        const toggleFAQ = (event) => {
            
            // Only handle specific events
            if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') {
                return;
            }
            
            // Prevent all event propagation
            event.preventDefault();
            event.stopImmediatePropagation();
            event.stopPropagation();

            const currentState = question.getAttribute('aria-expanded');
            const isExpanded = currentState === 'true';

        // Close all other FAQs first
            faqItems.forEach((otherItem, otherIndex) => {
                if (otherItem !== item) {
                    const otherQuestion = otherItem.querySelector('.faq-question');
                    const otherAnswer = otherItem.querySelector('.faq-answer');
                    if (otherQuestion && otherAnswer && otherQuestion.getAttribute('aria-expanded') === 'true') {
                        otherQuestion.setAttribute('aria-expanded', 'false');
            otherAnswer.style.maxHeight = '0px';
            otherItem.classList.remove('is-open');
                    }
                }
            });

            // Toggle current FAQ
            if (!isExpanded) {
                // Open: measure current content height and animate to it
                question.setAttribute('aria-expanded', 'true');
                item.classList.add('is-open');
                // If previously set to 'none', reset to the pixel height first so transition can run
                if (answer.style.maxHeight === 'none') {
                    answer.style.maxHeight = answer.scrollHeight + 'px';
                } else {
                    // Ensure we start from 0 then go to measured height
                    answer.style.maxHeight = answer.scrollHeight + 'px';
                }
            } else {
                // Close: if maxHeight was 'none', set it to current height to enable transition to 0
                question.setAttribute('aria-expanded', 'false');
                if (getComputedStyle(answer).maxHeight === 'none' || answer.style.maxHeight === 'none') {
                    // Set to actual pixel height to transition from
                    answer.style.maxHeight = answer.scrollHeight + 'px';
                    // Force reflow to apply the height before transitioning to 0
                    // eslint-disable-next-line no-unused-expressions
                    answer.offsetHeight;
                }
                answer.style.maxHeight = '0px';
                item.classList.remove('is-open');
            }
            
            return false;
        };

        // Add single event listener with capture
        question.addEventListener('click', toggleFAQ, true);
    });

    window.faqInitialized = true;
}

// Ensure this function is called within the main DOMContentLoaded listener in apps.js
// document.addEventListener('DOMContentLoaded', () => {
//     initFAQAccordion();
//     // ... other initializations ...
// });


// --- Other Initializations ---

function updateCopyrightYear() {
    const yearSpan = document.getElementById('current-year');
    if (yearSpan) yearSpan.textContent = new Date().getFullYear();
}

function populateTimezoneDropdown(selectId) {
    const selectElement = document.getElementById(selectId);
    if (!selectElement || selectElement.dataset.populated === 'true') return;

    try {
        const timezones = Intl.supportedValuesOf('timeZone');
        if (!timezones || timezones.length === 0) throw new Error("No timezones found via Intl API.");

        // Sort timezones alphabetically
        timezones.sort();

        selectElement.innerHTML = '<option value="" disabled selected>-- Select Your Timezone --</option>'; // Reset/Add placeholder

        timezones.forEach(tz => {
            // Optional: Filter out less common/deprecated timezones if desired
            // if (tz.startsWith('Etc/') || tz.startsWith('SystemV/') || tz.startsWith('US/')) continue;

            const option = document.createElement('option');
            option.value = tz;
            option.textContent = tz.replace(/_/g, ' ');
            selectElement.appendChild(option);
        });

        try { // Pre-select user's timezone
            const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
            if (timezones.includes(userTimezone)) selectElement.value = userTimezone;
        } catch (e) { console.warn("Could not pre-select user timezone."); }

        selectElement.dataset.populated = 'true';

    } catch (error) {
        console.error("Error populating timezone dropdown:", error);
        selectElement.innerHTML = '<option value="">Could not load timezones</option>';
    }
}

// Build filter buttons dynamically from projects' categories
function buildProjectFilters(projects) {
    const filterGroup = document.getElementById('project-filters');
    if (!filterGroup) return;
    const categories = new Map();
    projects.forEach(p => {
        const cat = (p.category || 'uncategorized').toLowerCase();
        categories.set(cat, (categories.get(cat) || 0) + 1);
    });
    // Sort by count desc then name
    const items = Array.from(categories.entries()).sort((a,b) => b[1]-a[1] || a[0].localeCompare(b[0]));

    // Build All button first
    const total = projects.length;
    let html = `
        <button class="filter-btn active" data-filter="all" aria-pressed="true">
            <span class="filter-label">All Projects</span>
            <span class="filter-count" data-count="all">${total}</span>
        </button>`;

    // Build category buttons
    items.forEach(([cat, count]) => {
        const label = formatCategoryLabel(cat);
        html += `
        <button class="filter-btn" data-filter="${cat}" aria-pressed="false">
            <span class="filter-label">${label}</span>
            <span class="filter-count" data-count="${cat}">${count}</span>
        </button>`;
    });

    filterGroup.innerHTML = html;
}

// --- Newsletter form micro-interactions ---
function initNewsletterForm() {
    // Support multiple signup forms across the site (e.g., blog CTA and footer)
    const forms = Array.from(document.querySelectorAll('.signup-form')).filter(f => !f.dataset.initialized);
    if (!forms.length) return;

    forms.forEach(form => {
        // Only attach to newsletter forms that actually have an email input
        const input = form.querySelector('input[type="email"]');
        if (!input) return;
        form.dataset.initialized = 'true';

        // Prefer a .form-message element; fallback to #newsletterMessage if present
        let msg = form.querySelector('.form-message') || form.querySelector('#newsletterMessage');
        if (!msg) {
            // Create a lightweight message element if not present
            msg = document.createElement('p');
            msg.className = 'form-message';
            msg.setAttribute('aria-live', 'polite');
            msg.hidden = true;
            // Insert after form if possible
            (form.appendChild) && form.appendChild(msg);
        }

        function showMessage(text, type) {
            if (!msg) return;
            msg.textContent = text;
            msg.hidden = false;
            msg.classList.remove('error', 'success');
            if (type) msg.classList.add(type);
        }

        let isSubmitting = false;
        let debounceTimer;

    function setLoading(loading) {
            isSubmitting = loading;
            const btn = form.querySelector('button[type="submit"]');
            if (btn) {
                btn.disabled = loading;
                btn.dataset.loading = loading ? '1' : '0';
        btn.setAttribute('aria-busy', loading ? 'true' : 'false');
            }
        }

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (isSubmitting) return;
            const value = (input.value || '').trim();
            // very basic email check; server will validate again
            const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
            if (!emailOk) {
                showMessage('Please enter a valid email address.', 'error');
                input.focus();
                return;
            }
            // Debounce quick double-submits
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(async () => {
                try {
                    setLoading(true);
                    // If the newsletter form has first/last name fields nearby, include them
                    const firstNameEl = document.getElementById('footerNewsletterFirstName');
                    const lastNameEl = document.getElementById('footerNewsletterLastName');
                    const bodyPayload = { email: value };
                    if (firstNameEl && firstNameEl.value) bodyPayload.firstName = firstNameEl.value.trim();
                    if (lastNameEl && lastNameEl.value) bodyPayload.lastName = lastNameEl.value.trim();
                    const resp = await fetch('/api/subscribe', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
                        body: JSON.stringify(bodyPayload)
                    });
                    const data = await resp.json().catch(() => ({ success: false, message: 'Unexpected response.' }));
                    if (resp.ok && data.success) {
                        if (data.redirect) { window.location.href = data.redirect; return; }
                        // For two-stage flow, default to redirecting; fallback message only
                        showMessage(data.message || 'Continue to complete your profile…', 'success');
                        input.value = '';
                    } else {
                        showMessage(data.message || 'Sorry, something went wrong. Please try again.', 'error');
                    }
                } catch (err) {
                    showMessage('Network error. Please try again.', 'error');
                } finally {
                    setLoading(false);
                }
            }, 200);
        });
    });
}

// Curated dual filters helpers
function buildDualProjectFilters(projects) {
    const serviceWrap = document.getElementById('service-filters');
    if (!serviceWrap) return; // no-op
    // Build only once per page load to preserve active selections
    if (serviceWrap.childElementCount > 0) return;
    const svcMap = new Map();
    projects.forEach(p => {
        (p.serviceTypes || []).forEach(s => {
            const id = String(s && (s._id || s.id || s));
            const name = String(s && (s.name || s));
            if (id && name) svcMap.set(id, name);
        });
    });
    const svcHtml = Array.from(svcMap.entries())
        .sort((a,b) => a[1].localeCompare(b[1]))
        .map(([id, name]) => `<button class="filter-btn" data-id="${escapeHtml(id)}" aria-pressed="false"><span class="filter-label">${escapeHtml(name)}</span></button>`)
        .join('');
    serviceWrap.innerHTML = svcHtml;
}

function updateDualFilterCounts(filters) {
    // Server-driven counts when provided
    if (filters && filters.services) {
        const svcWrap = document.getElementById('service-filters');
        if (svcWrap) {
            const counts = new Map(filters.services.map(f => [String(f._id), Number(f.count || 0)]));
            svcWrap.querySelectorAll('.filter-btn').forEach(btn => {
                const id = btn.getAttribute('data-id');
                const count = counts.get(String(id)) || 0;
                let countEl = btn.querySelector('.filter-count');
                if (!countEl) {
                    countEl = document.createElement('span');
                    countEl.className = 'filter-count';
                    btn.appendChild(countEl);
                }
                countEl.textContent = String(count);
            });
        }
    }
}

function renderProjectsPagination(pagination) {
    const pager = document.getElementById('projects-pagination');
    if (!pager || !pagination) return;
    const page = Number(pagination.page || 1);
    const totalPages = Number(pagination.totalPages || 1);
    if (totalPages <= 1) { pager.innerHTML = ''; return; }
    const link = (p, label, { active=false, disabled=false } = {}) => `<a href="#" data-page="${p}" class="pager-link${active?' active':''}${disabled?' disabled':''}">${label}</a>`;
    let html = '';
    html += link(Math.max(1, page - 1), 'Prev', { disabled: page <= 1 });
    for (let i = 1; i <= totalPages; i++) html += link(i, String(i), { active: i === page });
    html += link(Math.min(totalPages, page + 1), 'Next', { disabled: page >= totalPages });
    pager.innerHTML = html;
}

// Build filters using server-provided full list (preload stable bar)
function buildDualProjectFiltersFromServer(filters) {
    const serviceWrap = document.getElementById('service-filters');
    if (!serviceWrap || !filters) return;
    const svcHtml = (filters.services || [])
        .slice().sort((a,b) => String(a.name).localeCompare(String(b.name)))
        .map(f => `<button class="filter-btn" data-id="${escapeHtml(String(f._id))}" aria-pressed="false"><span class="filter-label">${escapeHtml(String(f.name))}</span><span class="filter-count">${Number(f.count||0)}</span></button>`)
        .join('');
    serviceWrap.innerHTML = svcHtml;
    // Apply active classes from deep-linked state, if any
    if (window.__projFilterState) markActiveButtonsFromState(window.__projFilterState);
}

function markActiveButtonsFromState(state) {
    try {
        const svcWrap = document.getElementById('service-filters');
        if (svcWrap) svcWrap.querySelectorAll('.filter-btn').forEach(btn => {
            const id = btn.getAttribute('data-id');
            const active = state.services.has(id);
            btn.classList.toggle('active', active);
            btn.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
    } catch(_) { /* ignore */ }
}

function syncProjectsUrl(state) {
    try {
        const url = new URL(window.location.href);
        url.searchParams.set('page', String(state.page || 1));
        // Clear existing multi params before appending new
        ['services'].forEach(k => url.searchParams.delete(k));
        Array.from(state.services).forEach(id => url.searchParams.append('services', id));
        window.history.replaceState(null, '', url.toString());
    } catch(_) { /* ignore */ }
}

// --- Legal pages: Table of Contents ---
function initLegalToc() {
    const main = document.getElementById('legal-main');
    const tocList = document.getElementById('legal-toc-list');
    if (!main || !tocList) return;

    const headings = Array.from(main.querySelectorAll('h2, h3, h4'));
    if (!headings.length) return;

    const slugCounts = new Map();
    const slugify = (text) => {
        const base = (text || '')
            .toLowerCase()
            .replace(/[^a-z0-9\s-]/g, '')
            .trim()
            .replace(/\s+/g, '-');
        const count = (slugCounts.get(base) || 0) + 1;
        slugCounts.set(base, count);
        return count > 1 ? `${base}-${count}` : base;
    };

    // Ensure headings have IDs
    headings.forEach(h => {
        if (!h.id) h.id = slugify(h.textContent);
    });

    // Build nested list: h2 as top-level, h3 as children
    const frag = document.createDocumentFragment();
    let currentTopLi = null;
    let currentSubUl = null;
    let currentSubSubUl = null;

    headings.forEach(h => {
    const tag = h.tagName.toLowerCase();
    const level = tag === 'h2' ? 2 : tag === 'h3' ? 3 : 4;
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = `#${h.id}`;
        a.textContent = h.textContent;
        a.addEventListener('click', (e) => {
            e.preventDefault();
            scrollToHeading(h);
            setActiveLink(a);
        });
        li.appendChild(a);

        if (level === 2) {
            currentTopLi = li;
            currentSubUl = document.createElement('ul');
            currentSubSubUl = null;
            currentTopLi.appendChild(currentSubUl);
            frag.appendChild(currentTopLi);
        } else if (level === 3) {
            if (!currentSubUl && currentTopLi) {
                currentSubUl = document.createElement('ul');
                currentTopLi.appendChild(currentSubUl);
            }
            if (currentSubUl) {
                currentSubUl.appendChild(li);
                currentSubSubUl = null;
            } else {
                frag.appendChild(li);
            }
        } else if (level === 4) {
            if (!currentSubSubUl) {
                currentSubSubUl = document.createElement('ul');
                if (currentSubUl) currentSubUl.appendChild(currentSubSubUl);
            }
            if (currentSubSubUl) {
                currentSubSubUl.appendChild(li);
            } else {
                frag.appendChild(li);
            }
        } else {
            // If the first heading is h3, just append flat
            frag.appendChild(li);
        }
    });

    tocList.innerHTML = '';
    tocList.appendChild(frag);

    // Active state handling on scroll
    const linkById = new Map();
    tocList.querySelectorAll('a').forEach(a => {
        const id = a.getAttribute('href').slice(1);
        linkById.set(id, a);
    });

    const observer = new IntersectionObserver((entries) => {
        // Pick the first visible heading nearest to top
        const visible = entries
            .filter(e => e.isIntersecting)
            .sort((a, b) => Math.abs(a.boundingClientRect.top) - Math.abs(b.boundingClientRect.top));
        if (!visible.length) return;
        const id = visible[0].target.id;
        const link = linkById.get(id);
        if (link) setActiveLink(link);
    }, {
        // Offset by header height using rootMargin
        root: null,
        rootMargin: `-${getHeaderOffset() + 24}px 0px -70% 0px`,
        threshold: [0, 1.0]
    });

    headings.forEach(h => observer.observe(h));

    // If page loads with a hash, adjust scroll position with header offset
    if (location.hash) {
        const target = document.getElementById(location.hash.slice(1));
        if (target) {
            setTimeout(() => scrollToHeading(target), 0);
        }
    }

    function setActiveLink(active) {
        tocList.querySelectorAll('a').forEach(a => a.classList.remove('is-active'));
        active.classList.add('is-active');
    }

    function scrollToHeading(target) {
        const offset = getHeaderOffset() + 16; // small extra padding
        const top = window.scrollY + target.getBoundingClientRect().top - offset;
        window.scrollTo({ top, behavior: 'smooth' });
        // Ensure focus for accessibility
        if (target && typeof target.focus === 'function') {
            target.setAttribute('tabindex', '-1');
            target.focus({ preventScroll: true });
        }
    }
}

function getHeaderOffset() {
    const header = document.getElementById('main-header') || document.getElementById('site-header');
    if (!header) return 88;
    const h = header.offsetHeight || 88;
    return Number.isFinite(h) ? h : 88;
}

// --- Smart Header Controller (Brookfield Scroll Logic) ---
// JS ONLY manages baseline scroll-position classes.
// CSS hover states on group/header handle the rest without conflict.
function initSmartHeader() {
    const header = document.getElementById('main-header');
    if (!header) return;

    const behavior = header.getAttribute('data-header-behavior');

    // Only manage scroll transparency if EJS told us to (homepage + hero pages)
    if (behavior === 'scroll-transparent') {
        const handleScroll = () => {
            // Don't override colors while mobile menu is open
            if (header.dataset.menuLocked === 'true') return;

            if (window.scrollY > 10) {
                // Scrolled: solid white background
                header.classList.remove('bg-transparent', 'text-white');
                header.classList.add('bg-white', 'text-[#1a1a1a]', 'shadow-sm');
            } else {
                // At top: restore transparent for dark hero
                header.classList.add('bg-transparent', 'text-white');
                header.classList.remove('bg-white', 'text-[#1a1a1a]', 'shadow-sm');
            }
        };
        window.addEventListener('scroll', handleScroll, { passive: true });
        handleScroll(); // Init on load
    }
    // static-opaque: EJS has already set bg-white text-[#1a1a1a] — JS does nothing
}

// --- Mobile Navigation (New Brookfield Header) ---
function initMobileNavNew() {
    const btn = document.getElementById('mobile-menu-btn');
    const nav = document.getElementById('mobile-nav');
    if (!btn || !nav) return;

    btn.addEventListener('click', () => {
        const isOpen = nav.classList.contains('flex');
        if (isOpen) {
            nav.classList.add('hidden');
            nav.classList.remove('flex');
        } else {
            nav.classList.remove('hidden');
            nav.classList.add('flex');
        }
        btn.setAttribute('aria-expanded', String(!isOpen));

        // Animate hamburger lines
        const lines = btn.querySelectorAll('.hamburger-line');
        if (!isOpen) {
            if (lines[0]) { lines[0].style.transform = 'rotate(45deg) translate(5px, 5px)'; }
            if (lines[1]) { lines[1].style.opacity = '0'; }
            if (lines[2]) { lines[2].style.transform = 'rotate(-45deg) translate(5px, -5px)'; }
        } else {
            if (lines[0]) { lines[0].style.transform = 'none'; }
            if (lines[1]) { lines[1].style.opacity = '1'; }
            if (lines[2]) { lines[2].style.transform = 'none'; }
        }
    });

    // Close mobile nav when clicking a link
    nav.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => {
            nav.classList.add('hidden');
            nav.classList.remove('flex');
            btn.setAttribute('aria-expanded', 'false');
            const lines = btn.querySelectorAll('.hamburger-line');
            if (lines[0]) { lines[0].style.transform = 'none'; }
            if (lines[1]) { lines[1].style.opacity = '1'; }
            if (lines[2]) { lines[2].style.transform = 'none'; }
        });
    });
}