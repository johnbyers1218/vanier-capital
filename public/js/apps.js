/**
 * FND Automations - Frontend JavaScript (apps.js)
 *
 * Responsibilities:
 * - Initialize UI components on DOM load.
 * - Handle mobile navigation toggle.
 * - Highlight active navigation link based on URL.
 * - Fetch and display dynamic content (Projects, Testimonials) via API calls.
 * - Handle Contact form submission (via API).
 * - Trigger and handle Scheduling form submission (via API).
 * - Implement FAQ accordion functionality.
 * - Update dynamic elements like the copyright year.
 * - Provide basic utility functions (e.g., escapeHtml).
 */

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {


    // Initialize core UI components
    initMobileNav();
    setActiveNavLink();
    initFAQAccordion();
    updateCopyrightYear();

    // Initialize dynamic content loading based on page elements
    if (document.getElementById('projects-grid-container')) {
        loadProjects(); // Load all projects on the /projects page
        initProjectFilters(); // Activate filter buttons if present
    }
    if (document.getElementById('testimonials-grid-container')) {
        loadTestimonials(); // Load testimonials on the /testimonials page
    }
    if (document.getElementById('projects-preview-grid')) {
        loadProjectPreview(); // Load preview on the homepage /
    }

    // Initialize form handlers if forms exist
    if (document.getElementById('contact-form')) {
        initContactAndScheduleForm();
    }
    // Schedule form is initialized dynamically after contact form success

  
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
    const navLinks = document.querySelectorAll('.nav-links a');
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
function createProjectCardHtml(project, isPreview = false) { // isPreview can still be used for minor variations if needed
    // Generate an excerpt from the potentially rich HTML description
    
    const excerpt = generateExcerptFromHtml(project.description, isPreview ? 80 : 120); // Shorter excerpt for preview

    const imageHtml = project.image
        ? `<div class="project-image-preview" style="height: 200px; overflow: hidden; border-radius: var(--border-radius) var(--border-radius) 0 0;">
             <img src="${escapeHtml(project.image)}" alt="${escapeHtml(project.title)}" loading="lazy" style="width: 100%; height: 100%; object-fit: cover;">
           </div>`
        : `<div class="project-image-preview" style="height: 200px; background-color: rgba(255,255,255,0.05); border-radius: var(--border-radius) var(--border-radius) 0 0; display: flex; align-items: center; justify-content: center; color: var(--gray-text);">
             <i class="fas fa-project-diagram fa-3x"></i>
           </div>`;

    // Link to the single project page using its slug
    const projectDetailUrl = `/projects/${escapeHtml(project.slug || 'no-slug-found')}`; // Added fallback for debugging
    const linkHtml = `<a href="${projectDetailUrl}" class="card-link cta-button secondary-btn">View Case Study →</a>`;

    return `
        <article class="content-card project-card" data-category="${escapeHtml(project.category || 'uncategorized')}">
            ${imageHtml}
            <div class="project-info">
                <h3><a href="${projectDetailUrl}" style="color: inherit; text-decoration: none;">${escapeHtml(project.title)}</a></h3>
                <span class="project-category">
                    Category: ${escapeHtml(project.category)}
                </span>
                <p>${escapeHtml(excerpt)}</p>
                ${linkHtml}
            </div>
        </article>
    `;
}

// --- Loaders --- (loadProjects will use the updated createProjectCardHtml)
function loadProjects() {
    loadGenericContent('/api/projects', 'projects-grid-container', createProjectCardHtml, 'projects');
}

// createFeaturedProjectHtml needs to be updated to use an excerpt too if its description is HTML
function createFeaturedProjectHtml(project) {
    const imageHtml = project.image
        ? `<div class="featured-project-image" style="min-height: 350px;">
               <img src="${escapeHtml(project.image)}" alt="${escapeHtml(project.title)}" loading="lazy" style="width: 100%; height: 100%; object-fit: cover;">
           </div>`
        : `<div class="featured-project-image" style="min-height: 350px; background-color: #222; display: flex; align-items: center; justify-content: center; color: var(--gray-text);"> <i class="fas fa-project-diagram fa-4x"></i></div>`;

    // Link to the single project page for the "View Details" button
    const projectDetailUrl = `/projects/${escapeHtml(project.slug)}`;
    const linkHtml = `<a href="${projectDetailUrl}" class="cta-button primary-btn" style="margin-top: auto; align-self: flex-start;">View Case Study</a>`;

    // Generate an excerpt for the featured project's description
    const excerpt = generateExcerptFromHtml(project.description, 200); // Longer excerpt for featured

    return `
        <div class="featured-project-content" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 0; align-items: stretch; background-color: var(--card-bg); border-radius: var(--border-radius); overflow:hidden; border: 1px solid var(--card-border); box-shadow: 0 5px 15px rgba(0,0,0,0.15);">
            ${imageHtml}
            <div class="featured-project-details" style="padding: 2rem 2.5rem; display: flex; flex-direction: column;">
                <h3><a href="${projectDetailUrl}" style="color: inherit; text-decoration: none;">${escapeHtml(project.title)}</a></h3>
                <p class="project-category" style="color: var(--primary-color); font-weight: 600; margin-bottom: 1rem; display: inline-block;">${escapeHtml(project.category)}</p>
                <p style="flex-grow: 1; margin-bottom: 1.5rem;">${escapeHtml(excerpt)}</p>
                ${linkHtml}
            </div>
        </div>
    `;
}


// Ensure your DOMContentLoaded listener calls loadProjects, loadFeaturedProject correctly.
document.addEventListener('DOMContentLoaded', () => {
  
    initMobileNav();
    setActiveNavLink();
    initFAQAccordion();
    updateCopyrightYear();

    if (document.getElementById('projects-grid-container')) {
        loadProjects();
        initProjectFilters();
    }
    if (document.getElementById('testimonials-grid-container')) {
        loadTestimonials();
    }
    if (document.getElementById('projects-preview-grid')) { // Homepage project preview
        // Ensure loadProjectPreview uses createProjectCardHtml which now links to slug
        loadProjectPreview(); // This function likely needs to use createProjectCardHtml with isPreview=true
    }
    if (document.getElementById('featured-project-container')) { // For /projects page featured
        loadFeaturedProject();
    }
    if (document.getElementById('featured-testimonial-container')) {
        loadFeaturedTestimonial();
    }

    if (document.getElementById('contact-form'))initContactAndScheduleForm();
    // Schedule form is initialized dynamically
   
});


// loadProjectPreview needs to correctly use createProjectCardHtml for the homepage preview
async function loadProjectPreview() {
    const container = document.getElementById('projects-preview-grid');
    if (!container) return;
    renderLoadingIndicator(container);
    try {
        const data = await fetchData('/api/projects?featured=true&limit=3'); // Fetch featured, or just latest
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

/** Creates HTML for a single Testimonial card */
function createTestimonialCardHtml(testimonial) {
    const ratingStars = testimonial.rating ?
        '<span class="star">★</span>'.repeat(testimonial.rating) +
        '<span class="star" style="color: #555;">★</span>'.repeat(5 - testimonial.rating)
        : '';
    const ratingHtml = testimonial.rating ? `<div class="rating">${ratingStars}</div>` : '';

    const authorTitle = `${escapeHtml(testimonial.position || '')}${testimonial.position && testimonial.company ? ', ' : ''}${escapeHtml(testimonial.company || '')}`;

    return `
        <div class="testimonial-card">
            <div class="testimonial-quote">
                <span class="quote-mark">"</span>
                <p>${escapeHtml(testimonial.content)}</p>
                <span class="quote-mark closing">"</span>
            </div>
            <div class="testimonial-author-info">
                <img src="/images/placeholder-client.png" alt="${escapeHtml(testimonial.author)}" loading="lazy" class="author-image">
                <div>
                    <h3>${escapeHtml(testimonial.author)}</h3>
                    ${authorTitle ? `<p>${authorTitle}</p>` : ''}
                    ${ratingHtml}
                </div>
            </div>
        </div>
    `;
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

function loadProjects() {
    loadGenericContent('/api/projects', 'projects-grid-container', createProjectCardHtml, 'projects');
}

function loadTestimonials() {
    loadGenericContent('/api/testimonials', 'testimonials-grid-container', createTestimonialCardHtml, 'testimonials');
}

async function loadProjectPreview() {
    const container = document.getElementById('projects-preview-grid');
    if (!container) return;
    renderLoadingIndicator(container);
    try {
        const data = await fetchData('/api/projects');
        container.innerHTML = ''; // Clear loading/placeholders
        if (data.projects && data.projects.length > 0) {
            const projectsToShow = data.projects.slice(0, 3); // Show max 3
            projectsToShow.forEach(project => {
                container.insertAdjacentHTML('beforeend', createProjectCardHtml(project, true));
            });
             // Add empty placeholders if needed for grid layout visually
             while (container.children.length % 3 !== 0 && container.children.length < 3) {
                 container.insertAdjacentHTML('beforeend', '<div style="visibility: hidden; height: 0;"></div>');
             }
             
        } else {
            renderNoDataMessage(container, 'projects');
        }
    } catch (error) {
        renderErrorMessage(container, `Could not load projects preview. ${error.message}`);
    }
}


// --- Project Filtering ---

function initProjectFilters() {
    const filterButtons = document.querySelectorAll('.projects-filter .filter-btn');
    const projectGrid = document.getElementById('projects-grid-container');
    if (!filterButtons.length || !projectGrid) return;

    filterButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            const filterValue = e.target.getAttribute('data-filter');
            
            filterButtons.forEach(btn => btn.classList.remove('active'));
            e.target.classList.add('active');

            // Simple Show/Hide Filter
            const projectCards = projectGrid.querySelectorAll('.project-card');
            projectCards.forEach(card => {
                 const category = card.dataset.category;
                 const shouldShow = (filterValue === 'all' || category === filterValue);
                 card.style.display = shouldShow ? 'flex' : 'none'; // Use flex since card uses flex
            });
        });
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
    const submitButton = mainForm?.querySelector('button[type="submit"]');
    const messageContainer = document.getElementById('contact-form-message');
    const scheduleFieldsContainer = document.getElementById('schedule-fields-container');
    const requestMeetingCheckbox = document.getElementById('request-meeting-checkbox');

    if (!mainForm || !submitButton || !messageContainer || !scheduleFieldsContainer || !requestMeetingCheckbox) {
        console.warn('Main contact form or its critical elements not found. Form not initialized.');
        return;
    }

    const originalButtonHtml = submitButton.innerHTML; // Store original button content

    const hiddenRequestedMeetingInput = document.createElement('input');
    hiddenRequestedMeetingInput.type = 'hidden';
    hiddenRequestedMeetingInput.name = 'requestedMeeting';
    hiddenRequestedMeetingInput.value = 'false';
    mainForm.appendChild(hiddenRequestedMeetingInput);

    requestMeetingCheckbox.addEventListener('change', function() {
        // ... (your existing checkbox logic to show/hide schedule fields) ...
        if (this.checked) {
            scheduleFieldsContainer.style.display = 'block';
            document.querySelector('.schedule-fields-inner-grid').style.display = 'grid';
            hiddenRequestedMeetingInput.value = 'true';
            document.getElementById('schedule-contactName-mirror').value = document.getElementById('name').value || '';
            document.getElementById('schedule-contactEmail-mirror').value = document.getElementById('email').value || '';
            document.getElementById('schedule-companyName').value = document.getElementById('schedule-contactName-mirror').value ? (document.getElementById('name').value + ' Company') : '';
            populateTimezoneDropdown('schedule-timezone');
        } else {
            scheduleFieldsContainer.style.display = 'none';
            document.querySelector('.schedule-fields-inner-grid').style.display = 'none';
            hiddenRequestedMeetingInput.value = 'false';
        }
    });

    mainForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        

        submitButton.disabled = true;
        submitButton.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Sending...`;
        displayStatusMessage('contact-form-message', ''); // Clear general message area
        clearFieldErrors(); // Clear individual field errors

        const formData = new FormData(mainForm);
        const formObject = Object.fromEntries(formData.entries());
        const privacyCheckbox = document.getElementById('privacy');
        formObject.privacy = privacyCheckbox ? (privacyCheckbox.checked ? 'on' : 'off') : 'off';
        formObject.requestedMeeting = (hiddenRequestedMeetingInput.value === 'true');

        if (!formObject.requestedMeeting) {
            delete formObject.scheduleCompanyName;
            delete formObject.schedulePreferredTimes;
            delete formObject.scheduleSelectedDate;
            delete formObject.scheduleSelectedTime;
            delete formObject.scheduleTimeZone;
        } else {
            formObject.scheduleCompanyName = formData.get('scheduleCompanyName');
        }

     

        try {
            const data = await fetchData('/api/contact', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formObject)
            });

        

            if (data.success) {
                displayStatusMessage('contact-form-message', data.message, true);
                mainForm.reset();
                requestMeetingCheckbox.checked = false;
                scheduleFieldsContainer.style.display = 'none';
                document.querySelector('.schedule-fields-inner-grid').style.display = 'none';
                hiddenRequestedMeetingInput.value = 'false';

                setTimeout(() => {
                    if (document.getElementById('contact-form-message')) {
                        // displayStatusMessage('contact-form-message', ''); // Optionally clear global success
                    }
                }, 7000);
            } else {
                // Display general error message
                displayStatusMessage('contact-form-message', data.message || 'Please correct the errors below.', false);
                // Display individual field errors
                if (data.errors) {
                    displayFieldErrors(data.errors);
                }
            }
        } catch (error) {
            console.error('Error submitting combined form:', error);
            displayStatusMessage('contact-form-message', error.message || 'An unexpected error occurred.', false);
        } finally {
            // ALWAYS reset button text and enabled state
            submitButton.disabled = false;
            submitButton.innerHTML = originalButtonHtml;
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
        // Fetch only the featured project, limit 1
        const data = await fetchData('/api/projects?featured=true&limit=1');

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

async function loadFeaturedTestimonial() {
    const container = document.getElementById('featured-testimonial-container');
    if (!container) {
        console.warn('Featured testimonial container not found.');
        return;
    }
    container.innerHTML = '<p style="text-align: center; padding: 1rem; color: var(--gray-text);">Loading featured testimonial...</p>';
    try {
        const data = await fetchData('/api/testimonials?featured=true&limit=1');
      

        if (data.success && data.testimonials && data.testimonials.length > 0) {
            const featuredTestimonial = data.testimonials[0]; // Assuming the API returns it sorted
            container.innerHTML = createFeaturedTestimonialHtml(featuredTestimonial);
        } else {
            console.warn('No featured testimonial found or API success was false.'); // Changed from console.log to logger
            // Display a more user-friendly message or hide the section
            container.innerHTML = '<p style="text-align: center; color: var(--gray-text); padding: 1rem;">No featured testimonial available at the moment.</p>';
            // container.style.display = 'none'; // Or hide section
        }
    } catch (error) {
         console.error('Error in loadFeaturedTestimonial:', error); // Log the actual error
         container.innerHTML = `<p style="text-align: center; color: var(--danger-color);">Error loading featured testimonial. ${escapeHtml(error.message)}</p>`;
    }
}

function createFeaturedTestimonialHtml(testimonial) {
     // Ensure all fields used here (testimonial.content, testimonial.author, etc.) exist
     if (!testimonial || !testimonial.content || !testimonial.author) {
         console.error("Missing data for createFeaturedTestimonialHtml", testimonial);
         return '<p style="text-align: center; color: var(--danger-color);">Error: Incomplete testimonial data.</p>';
     }
     const ratingStars = testimonial.rating ? '<span class="star">★</span>'.repeat(testimonial.rating) + '<span class="star" style="color: #555;">★</span>'.repeat(5 - testimonial.rating) : '';
     const ratingHtml = testimonial.rating ? `<div class="rating">${ratingStars}</div>` : '';
     const authorTitle = `${escapeHtml(testimonial.position || '')}${testimonial.position && testimonial.company ? ', ' : ''}${escapeHtml(testimonial.company || '')}`;

     // Using placeholder image as per previous setup. Ensure this image exists.
     const authorImage = testimonial.authorImage || '/images/placeholder-client.png';

     return `
         <div class="featured-testimonial" style="background-color: var(--card-hover-bg); padding: 2.5rem; border-radius: var(--border-radius); border: 1px solid var(--primary-color); max-width: 900px; margin: 0 auto;">
              <div class="testimonial-quote">
                  <span class="quote-mark">"</span>
                  <p>${escapeHtml(testimonial.content)}</p>
                  <span class="quote-mark closing">"</span>
              </div>
               <div class="testimonial-author-info">
                  <img src="${escapeHtml(authorImage)}" alt="${escapeHtml(testimonial.author)}" class="author-image">
                  <div>
                      <h3>${escapeHtml(testimonial.author)}</h3>
                      ${authorTitle ? `<p>${authorTitle}</p>` : ''}
                      ${ratingHtml}
                  </div>
              </div>
          </div>
     `;
}



// public/js/apps.js

// ... (other functions like escapeHtml, fetchData, etc. remain the same) ...

/** Creates HTML for the featured project section */
function createFeaturedProjectHtml(project) {
    // Similar structure to the static version, using dynamic data
    // Ensure escapeHtml is used for user-generated content
    const imageHtml = project.image
        ? `<div class="featured-project-image" style="min-height: 350px;">
               <img src="${escapeHtml(project.image)}" alt="${escapeHtml(project.title)}" loading="lazy" style="width: 100%; height: 100%; object-fit: cover;">
           </div>`
        : `<div class="featured-project-image" style="min-height: 350px; background-color: #222; display: flex; align-items: center; justify-content: center; color: var(--gray-text);"> <i class="fas fa-project-diagram fa-4x"></i></div>`;

    // Determine the correct link: to the project itself if a link exists, otherwise to the main /projects page
    const linkHtml = project.link
        ? `<a href="${escapeHtml(project.link)}" class="cta-button primary-btn" target="_blank" rel="noopener noreferrer" style="margin-top: auto; align-self: flex-start;">View Details</a>`
        : `<a href="/projects" class="cta-button primary-btn" style="margin-top: auto; align-self: flex-start;">More Projects</a>`;

    // --- REMOVED highlightsHtml ---
    // const highlightsHtml = `
    //     <ul class="project-highlights" style="margin: 1rem 0 1.5rem 0; list-style: none; padding: 0; font-size: 0.9rem;">
    //         <li style="margin-bottom: 0.5rem; position: relative; padding-left: 1.5rem;"><i class="fas fa-check-circle" style="color: var(--primary-color); position: absolute; left: 0; top: 5px;"></i>Key Feature 1</li>
    //         <li style="margin-bottom: 0.5rem; position: relative; padding-left: 1.5rem;"><i class="fas fa-check-circle" style="color: var(--primary-color); position: absolute; left: 0; top: 5px;"></i>Significant Result</li>
    //     </ul>`;

    return `
        <div class="featured-project-content" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 0; align-items: stretch; background-color: var(--card-bg); border-radius: var(--border-radius); overflow:hidden; border: 1px solid var(--card-border); box-shadow: 0 5px 15px rgba(0,0,0,0.15);">
            ${imageHtml}
            <div class="featured-project-details" style="padding: 2rem 2.5rem; display: flex; flex-direction: column;">
                <h3 style="color: var(--light-text);">${escapeHtml(project.title)}</h3>
                <p class="project-category" style="color: var(--primary-color); font-weight: 600; margin-bottom: 1rem; display: inline-block;">${escapeHtml(project.category)}</p>
                <p style="flex-grow: 1; margin-bottom: 1.5rem;">${escapeHtml(project.description)}</p> 
                ${linkHtml}
            </div>
        </div>
    `;
}

// ... (rest of your apps.js file, including loadFeaturedProject and DOMContentLoaded listener) ...

// --- Modify DOMContentLoaded Listener ---
document.addEventListener('DOMContentLoaded', () => {
    // ... other initializations ...

    // Initialize dynamic FEATURED content loading
    if (document.getElementById('featured-project-container')) {
        loadFeaturedProject();
    }
    if (document.getElementById('featured-testimonial-container')) {
        loadFeaturedTestimonial();
    }

    // Initialize dynamic LIST content loading (prevent double loading if preview exists)
    if (document.getElementById('projects-grid-container') && !document.getElementById('projects-preview-grid')) {
        loadProjects();
        initProjectFilters();
    }
    if (document.getElementById('testimonials-grid-container') && !document.getElementById('featured-testimonial-container')) {
        // Only load full list if not already showing featured (or adjust logic as needed)
        loadTestimonials();
    }
     // Preview loader (ensure it doesn't conflict if on same page as full list)
     if (document.getElementById('projects-preview-grid')) {
        loadProjectPreview();
    }

    // ... form handlers etc. ...
});

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

// Inside public/js/apps.js

function initFAQAccordion() {
    const faqItems = document.querySelectorAll('.faq-item'); // Get all items
    if (!faqItems.length) {
  
        return; // Exit if no items found
    }

    faqItems.forEach((item, index) => { // Loop through each item
        const question = item.querySelector('.faq-question');
        const answer = item.querySelector('.faq-answer');

        // Ensure both question and answer elements exist for this item
        if (question && answer) {
            // Ensure unique IDs for accessibility mapping if not already set in EJS
            const answerId = `faq-answer-${index + 1}`;
            if (!answer.id) { // Set ID if missing
                answer.id = answerId;
            }
            question.setAttribute('aria-controls', answerId);

            // Set initial state correctly
            const isInitiallyExpanded = question.classList.contains('expanded'); // Check if manually expanded
            question.setAttribute('aria-expanded', isInitiallyExpanded ? 'true' : 'false');
            if (!isInitiallyExpanded) {
                 answer.setAttribute('hidden', ''); // Hide if not initially expanded
                 answer.style.maxHeight = null;
            } else {
                 answer.removeAttribute('hidden');
                 answer.style.maxHeight = answer.scrollHeight + "px"; // Set initial height if expanded
            }

            // Make question focusable and indicate clickable nature
            question.style.cursor = 'pointer';
            question.setAttribute('tabindex', '0');

            // Define the toggle function
            const toggleAnswer = (event) => {
                 // Prevent default if it's a keydown for space/enter on a button-like element
                 if (event.type === 'keydown' && (event.key !== 'Enter' && event.key !== ' ')) {
                    return;
                 }
                 event.preventDefault(); // Prevent default for space/enter keydown

                 const isExpanded = question.getAttribute('aria-expanded') === 'true';

                 // --- Optional: Accordion Behavior (Close others) ---
                 // Uncomment this block if you want only ONE answer open at a time
                 /*
                 if (!isExpanded) { // Only close others when opening a new one
                     faqItems.forEach(otherItem => {
                         if (otherItem !== item) {
                             const otherQuestion = otherItem.querySelector('.faq-question');
                             const otherAnswer = otherItem.querySelector('.faq-answer');
                             if (otherQuestion && otherAnswer) {
                                 otherQuestion.setAttribute('aria-expanded', 'false');
                                 otherAnswer.setAttribute('hidden', '');
                                 otherAnswer.style.maxHeight = null;
                             }
                         }
                     });
                 }
                 */
                 // --- End Optional Accordion Behavior ---


                 // Toggle the current item's state
                 question.setAttribute('aria-expanded', !isExpanded);
                 if (!isExpanded) { // If opening
                     answer.removeAttribute('hidden');
                     // Important: Set max-height *after* removing hidden to measure scrollHeight correctly
                     // Use requestAnimationFrame for smoother transition start
                     requestAnimationFrame(() => {
                           answer.style.maxHeight = answer.scrollHeight + "px";
                     });
                 } else { // If closing
                     answer.style.maxHeight = null;
                     // Add hidden attribute *after* transition ends for accessibility
                      answer.addEventListener('transitionend', () => {
                          if (question.getAttribute('aria-expanded') === 'false') { // Check state again in case of rapid clicks
                             answer.setAttribute('hidden', '');
                          }
                      }, { once: true }); // Remove listener after it runs once
                 }
            };

            // Add event listeners
            question.addEventListener('click', toggleAnswer);
            question.addEventListener('keydown', toggleAnswer); // Handle Enter/Space keys

        } else {
             console.warn('FAQ item missing question or answer element:', item);
        }
    });
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