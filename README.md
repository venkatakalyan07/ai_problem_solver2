# AI Problem Solver

AI Problem Solver is a lightweight web application for turning programming
problem statements into readable, language-specific solutions. Choose a
programming language, describe the problem, and receive a generated solution
with an explanation of the approach and its time and space complexity.

The application uses a simple HTML, CSS, and JavaScript frontend backed by an
Express API. The backend sends requests to NVIDIA's hosted chat-completions API,
so the NVIDIA API key stays on the server and is never exposed to the browser.

## Features

- Generate solutions from a problem description.
- Select from Python, JavaScript, Java, C++, C#, Go, and Rust.
- Receive a problem understanding, approach, solution code, and complexity
  analysis.
- Copy the solution code without its Markdown code fences.
- Keep the NVIDIA API credential in a server-side environment variable.
- Serve the frontend and API from the same Express application.

## Requirements

- Node.js 18 or later.
- An NVIDIA API key with access to the configured model.

## Run locally

1. Clone this repository and open a terminal in the project directory.
2. Install the backend dependencies:

   ```powershell
   cd Backend
   npm install
   ```

3. Create a local environment file from the example:

   ```powershell
   Copy-Item .env.example .env
   ```

4. Add your NVIDIA API key to `Backend/.env`:

   ```dotenv
   NVIDIA_API_KEY=your_nvidia_api_key_here
   ```

   Do not commit `.env` or share the key. The repository ignores this file.

5. Start the server:

   ```powershell
   npm start
   ```

6. Open [http://localhost:3000](http://localhost:3000) in your browser.

The server uses `PORT` when set, and otherwise listens on port `3000`.

## API

### `POST /api/solve`

Request JSON:

```json
{
  "problem": "Write a function that returns the sum of two integers.",
  "language": "Python"
}
```

Supported language values are `Python`, `JavaScript`, `Java`, `C++`, `C#`,
`Go`, and `Rust`. If `language` is omitted, the backend defaults to Python.

Successful response:

```json
{
  "solution": "Generated explanation and solution..."
}
```

Invalid input and AI service errors return a JSON object with an `error`
message and an appropriate HTTP status.

## Project structure

```text
.
├── Backend/
│   ├── .env.example   # Environment variable template
│   ├── package.json   # Backend scripts and dependencies
│   └── server.js      # Express server and NVIDIA API integration
├── Frontend/
│   ├── index.html     # Application page
│   ├── script.js      # Frontend behavior and API request
│   └── style.css      # Application styles
└── .gitignore
```

## Model configuration

The backend calls NVIDIA's chat-completions endpoint with the
`nvidia/nemotron-3-nano-omni-30b-a3b-reasoning` model. Configure the credential
as `NVIDIA_API_KEY` in the server environment. Never put the key in frontend
files or commit it to source control.