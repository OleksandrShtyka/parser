# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is currently not compatible with SWC. See [this issue](https://github.com/vitejs/vite-plugin-react/issues/428) for tracking the progress.

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

## Email verification

The API server (`python server.py`) can send registration confirmation codes via SMTP. Configure these environment variables before starting the server:

- `SMTP_HOST` – required SMTP server host  
- `SMTP_PORT` – port number (default `587`)
- `SMTP_USERNAME` / `SMTP_PASSWORD` – credentials if your server requires authentication
- `SMTP_FROM` – optional email displayed in the “From” field (defaults to `SMTP_USERNAME`)
- `SMTP_USE_TLS` – set to `false` to disable STARTTLS (default `true`)
- `SMTP_USE_SSL` – set to `true` to use implicit TLS/SSL (default `false`)
- `SMTP_TIMEOUT` – optional socket timeout in seconds (default `10`)
- `APP_NAME` – optional label used in email subject/body (default `Parser`)
- `YTDLP_COOKIES` – optional path to a `cookies.txt` file (exported from a browser) that yt-dlp will use for YouTube requests

If `SMTP_HOST` is not provided, the server switches to a development fallback: verification codes are written to the server console and the `/api/send-verification` response includes `sent: false`. Use this only locally, because emails are not actually delivered.

The frontend calls `POST /api/send-verification` with `{ email, code, name }`; the server uses the values above to deliver the message. Ensure the backend is running and has network access to your SMTP host so new users can receive confirmation codes.

### YouTube reliability tips

YouTube frequently changes their anti-automation checks. If you begin seeing `Precondition check failed`, `HTTP Error 400`, or `nsig extraction failed` errors from yt-dlp:

- Update yt-dlp to the latest release (`pip install -U yt-dlp`).
- Export fresh cookies from a logged-in browser session and point `YTDLP_COOKIES` at that file before starting `server.py`.
- Retry after a short delay; throttling often clears after a few minutes.
- Check the yt-dlp issue tracker for current breakages: https://github.com/yt-dlp/yt-dlp/issues
