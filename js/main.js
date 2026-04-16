// OffPitchOS Landing Page Scripts

// === Scroll Fade-In ===
document.addEventListener('DOMContentLoaded', () => {
    const sections = document.querySelectorAll(
        '.problems, .features, .how-it-works, .tiers, .final-cta'
    );

    sections.forEach(section => section.classList.add('fade-in'));

    const observer = new IntersectionObserver(
        (entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                    observer.unobserve(entry.target);
                }
            });
        },
        { threshold: 0.15 }
    );

    sections.forEach(section => observer.observe(section));
});

// === Waitlist Form Handling ===
// IMPORTANT: Replace YOUR_FORM_ID with your actual Formspree form ID.
// Create one at https://formspree.io (free tier works).
const FORMSPREE_URL = 'https://formspree.io/f/mlgowzdl';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function handleFormSubmit(form, messageEl) {
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const emailInput = form.querySelector('input[type="email"]');
        const submitBtn = form.querySelector('button[type="submit"]');
        const email = emailInput.value.trim();

        if (!email || !EMAIL_REGEX.test(email)) {
            messageEl.hidden = false;
            messageEl.textContent = 'Please enter a valid email address.';
            messageEl.className = 'form-message form-message--error';
            return;
        }

        // Loading state
        const originalText = submitBtn.textContent;
        submitBtn.textContent = 'Submitting...';
        submitBtn.disabled = true;
        messageEl.hidden = true;

        try {
            const response = await fetch(FORMSPREE_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify({ email }),
            });

            if (response.ok) {
                form.hidden = true;
                messageEl.hidden = false;
                messageEl.textContent = "You're on the list! We'll be in touch soon.";
                messageEl.className = 'form-message form-message--success';
            } else {
                throw new Error('Submit failed');
            }
        } catch {
            messageEl.hidden = false;
            messageEl.textContent = 'Something went wrong. Please try again.';
            messageEl.className = 'form-message form-message--error';
            submitBtn.textContent = originalText;
            submitBtn.disabled = false;
        }
    });
}

const heroForm = document.getElementById('hero-form');
const heroMessage = document.getElementById('hero-message');
const footerForm = document.getElementById('footer-form');
const footerMessage = document.getElementById('footer-message');

if (heroForm) handleFormSubmit(heroForm, heroMessage);
if (footerForm) handleFormSubmit(footerForm, footerMessage);
