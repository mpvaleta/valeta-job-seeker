# V's Application Autofill companion

This unpacked Chrome extension can copy the visible job page you are already viewing, send a whole page of search results to your Discovery Inbox, and preview/fill common job-application fields from the JSON package exported by V's Job Seeker. It has visible-page extractors for LinkedIn, Indeed, Greenhouse, Lever, Workday, Ashby, iCIMS, and SmartRecruiters. It uses your already-open page rather than sending a login or cookie to V's. It keeps the selected résumé version visible, skips fields that already contain a value, never clicks submit, and leaves file uploads, controlled fields, sensitive questions, and dropdowns for manual review.

## Install on a MacBook

1. Download or clone this repository.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode**.
4. Choose **Load unpacked** and select this `extension` folder.
5. In V's Job Seeker, open **Autofill assistant**, choose the résumé version for this application, and download the JSON package.
6. Open the extension, paste the package, and choose **Save profile**.
7. For a LinkedIn or login-only job page, open the extension and choose **Copy visible job page**. In V's **Role workspace**, choose **Paste visible-page capture**.
8. On an application form, choose **Scan page**. Review the blue, orange, and unmapped fields.
9. Choose **Fill ready fields** only after the preview looks correct.

## Send captured roles straight to your inbox

Open **Send straight to V's** in the extension, enter your app address and your access token, and save. Both are kept in this browser's extension storage and sent only to that address.

With the connection saved, **Send this results list to V's** reads the search results already rendered on the page in front of you — LinkedIn and Indeed have purpose-built extractors, other boards fall back to a generic one — and files them in your Discovery Inbox, scored against your radar goals. Nothing is fetched, no page is opened that you did not open, and no login or cookie ever leaves your browser. This replaces copying twenty-five roles one at a time.

After updating the extension files, open `chrome://extensions` and choose **Reload** for V's Application Autofill before testing it again.

Version 0.7 adds the direct connection and the results-list capture described above. Version 0.4 fixed a field-label bug that could cause unrelated values to be mapped when a site wrapped many questions in one group. Reload the extension after updating; Chrome does not automatically reload unpacked extension code.

Always review every field before submitting. Application sites change frequently; unsupported fields remain untouched.
