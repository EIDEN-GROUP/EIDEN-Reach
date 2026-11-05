@echo off
cd /d "%~dp0.."
echo Starting Vite frontend (http://localhost:5173) and Mailbox worker (http://127.0.0.1:8787)...
start "EIDEN-Vite" cmd /k "npm run dev"
timeout /t 2 /nobreak >nul
start "EIDEN-Worker" cmd /k "cd workers\mailbox && npx wrangler dev --port 8787"
echo Launched. Bring both terminals to the foreground.