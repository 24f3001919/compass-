# 🚀 Compass External Tracking Integration Guide

This guide explains how to connect your personal portfolio website to the Compass Application Center so that when you apply for a job via your site, it is automatically marked as **SUBMITTED** in your tracking dashboard.

## 1. The Integration Code (Copy & Paste)

Add this JavaScript snippet to your website. The best place is usually in a global `utils.js` file or right before the closing `</body>` tag of your site.

```javascript
/**
 * Compass Career Copilot - External Tracker
 * Call this function when a user clicks your "Apply" button.
 */
async function trackCompassApplication(opportunityId) {
  // REPLACE THIS with your actual deployed Compass API URL
  const COMPASS_API_BASE = 'https://your-compass-api.vercel.app/api/career';
  
  try {
    const response = await fetch(`${COMPASS_API_BASE}/track-external-application?opportunity_id=${opportunityId}&source=portfolio_website`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      console.log('✅ Application successfully tracked in Compass!');
    } else {
      const err = await response.text();
      console.error('❌ Compass Tracking Error:', err);
    }
  } catch (error) {
    console.error('🌐 Network error connecting to Compass:', error);
  }
}
```

## 2. How to trigger it on your "Apply" button

In your website's HTML, add the `onclick` event to your apply buttons. You just need to pass the `opportunity_id` (the ID from the Compass database).

### Example:
```html
<!-- Example for a Frontend Engineer role (ID: 123) -->
<a 
  href="https://company.com/apply/job-123" 
  target="_blank" 
  onclick="trackCompassApplication(123)"
  class="apply-button"
>
  Apply Now
</a>
```

## 3. How it works internally
1. **Request**: Your website sends a `POST` request to `/api/career/track-external-application`.
2. **Auto-Creation**: Compass checks if the application exists. If not, it creates one automatically.
3. **State Change**: The application status is immediately transitioned to `SUBMITTED`.
4. **Timestamp**: The `submitted_at` field is updated to the current time.
5. **Sync**: Next time you open the **Application Center** in Compass, the job will be waiting for you in the "Submitted" column.

## 4. Troubleshooting
- **CORS Error**: If you see a CORS error in the browser console, ensure your backend `main.py` or `router.py` allows requests from your portfolio website's domain.
- **404 Error**: Double-check that the `opportunity_id` you are passing exists in your Compass `radar` database.
