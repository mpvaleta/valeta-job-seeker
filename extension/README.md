# V's Application Autofill companion

This unpacked Chrome extension previews and fills common job-application fields from the JSON package exported by V's Job Seeker. It detects common Greenhouse, Lever, Workday, Ashby, iCIMS, and SmartRecruiters pages, but uses the visible form fields rather than scraping the platform. It never clicks submit, never fills file uploads, and highlights sensitive fields and dropdowns for manual review.

## Install on a MacBook

1. Download or clone this repository.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode**.
4. Choose **Load unpacked** and select this `extension` folder.
5. In V's Job Seeker, open **Autofill assistant** and download the JSON package.
6. Open the extension, paste the package, and choose **Save profile**.
7. On an application form, choose **Scan page**. Review the blue, orange, and unmapped fields.
8. Choose **Fill ready fields** only after the preview looks correct.

Always review every field before submitting. Application sites change frequently; unsupported fields remain untouched.
