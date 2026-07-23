# V's Application Autofill companion

This unpacked Chrome extension can copy the visible job page you are already viewing and preview/fill common job-application fields from the JSON package exported by V's Job Seeker. It has visible-page extractors for LinkedIn, Indeed, Greenhouse, Lever, Workday, Ashby, iCIMS, and SmartRecruiters. It uses your already-open page rather than sending a login or cookie to V's. It never clicks submit, never fills file uploads or numeric fields, and highlights sensitive fields and dropdowns for manual review.

## Install on a MacBook

1. Download or clone this repository.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode**.
4. Choose **Load unpacked** and select this `extension` folder.
5. In V's Job Seeker, open **Autofill assistant** and download the JSON package.
6. Open the extension, paste the package, and choose **Save profile**.
7. For a LinkedIn or login-only job page, open the extension and choose **Copy visible job page**. In V's **Role workspace**, choose **Paste visible-page capture**.
8. On an application form, choose **Scan page**. Review the blue, orange, and unmapped fields.
9. Choose **Fill ready fields** only after the preview looks correct.

After updating the extension files, open `chrome://extensions` and choose **Reload** for V's Application Autofill before testing it again.

Version 0.4 fixes a field-label bug that could cause unrelated values to be mapped when a site wrapped many questions in one group. Reload the extension after updating; Chrome does not automatically reload unpacked extension code.

Always review every field before submitting. Application sites change frequently; unsupported fields remain untouched.
