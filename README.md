
AI Presentation Architect

An AI-powered web application that creates and edits professional, visually rich presentations through a simple chat interface. Forget manual slide design; just tell the AI what you want, and watch it build a complete presentation with unique themes, layouts, charts, and real-time web imagery.


Core Features

Conversational Interface: Create, edit, and refine your entire presentation using natural language commands.

AI Creative Director: The agent acts as a creative director, generating a unique visual theme (colors, fonts, backgrounds) and a complete slide-by-slide content plan from a single prompt.

Dynamic Visuals: Goes beyond simple text and bullets. The AI can:

Generate complex, data-driven infographics using D3.js and Chart.js.

Create artistic and asymmetrical image compositions with shapes, shadows, and precise positioning.

Real-time Web Sourcing: Automatically searches the web using a local SearXNG instance to find relevant, up-to-date images and data snippets to populate your slides.

Advanced Reasoning: Leverages the "thinking" capabilities of Google's Gemini 2.5 models to perform complex planning and editing tasks, ensuring more coherent and intelligent revisions.

PPTX Export: Exports the final presentation as a high-fidelity .pptx file, with each slide rendered as a perfect static image.

How It Works

The application uses an agentic architecture to manage the complex task of presentation creation.

Initial Prompt: The user provides an initial prompt (e.g., "a presentation on the history of space exploration with a retro theme").

Planning Phase: The PresentationAgent uses a "thinking-enabled" LLM call to generate a comprehensive JSON object that serves as the "source of truth" for the entire presentation. This plan includes:

A unique theme (colors, fonts, etc.).

A list of slides, each with a title, body, layout style, and queries for visuals.

Asset Sourcing & Generation: The agent iterates through the plan:

It uses a local SearXNG instance to execute image and data search queries.

For standard slides, it calls an LLM to generate self-contained HTML/CSS based on the slide data and theme.

For complex infographics, it delegates the task to a specialized InfographicsAgent.

Streaming to UI: Each generated slide is streamed back to the user's browser in real-time.

Editing Loop: The user provides feedback (e.g., "Change the image on slide 3"). The PresentationAgent makes another "thinking" call to intelligently update the master JSON plan. It then identifies only the changed slides and regenerates them.

Export: When requested, the StaticImageExporter uses a headless browser (Playwright) to take high-resolution screenshots of each slide's final HTML, then compiles them into a .pptx file.

Tech Stack

Backend: Python, Flask, Google GenAI SDK (gemini-2.5-flash-lite)

Data/Image Sourcing: SearXNG (self-hosted)

Exporting: Playwright, python-pptx

Frontend: HTML, CSS, JavaScript (served by Flask)

Setup and Installation

This project requires a self-hosted SearXNG instance for its core functionality.

1. Prerequisites

Python 3.9+

Node.js (for Playwright)

Docker and Docker Compose (Recommended for SearXNG)

2. Set up SearXNG

You must have a SearXNG instance running that is accessible to the Python application. The code is configured to connect to http://127.0.0.1:8888.

The easiest way to run SearXNG is with Docker:

code
Bash
download
content_copy
expand_less

# 1. Clone the official SearXNG Docker repository
git clone https://github.com/searxng/searxng-docker.git
cd searxng-docker

# 2. Update the settings to enable JSON format and listen on port 8888
sed -i "s|8080:8080|8888:8080|" docker-compose.yml
echo "search:" >> searxng/settings.yml
echo "  formats:" >> searxng/settings.yml
echo "    - json" >> searxng/settings.yml

# 3. Run the instance
docker-compose up -d

You can verify it's working by navigating to http://localhost:8888 in your browser.

3. Project Setup
code
Bash
download
content_copy
expand_less
IGNORE_WHEN_COPYING_START
IGNORE_WHEN_COPYING_END
# 1. Clone this repository
git clone <your-repo-url>
cd <your-repo-name>

# 2. Create and activate a Python virtual environment
python -m venv venv
source venv/bin/activate  # On Windows use `venv\Scripts\activate`

# 3. Install Python dependencies
# (Assuming a requirements.txt file exists with Flask, google-genai, python-dotenv, requests, beautifulsoup4, python-pptx, playwright)
pip install Flask "google-genai>=1.16.0" python-dotenv requests beautifulsoup4 python-pptx playwright

# 4. Install Playwright's browser binaries
playwright install

# 5. Create your environment file
cp .env.example .env
4. Configure Environment

Open the .env file and add your Google AI Studio API key:

code
Code
download
content_copy
expand_less
IGNORE_WHEN_COPYING_START
IGNORE_WHEN_COPYING_END
# .env
GEMINI_API_KEY="your_google_api_key_here"
5. Run the Application
code
Bash
download
content_copy
expand_less
IGNORE_WHEN_COPYING_START
IGNORE_WHEN_COPYING_END
python app.py

Navigate to http://localhost:5000 in your browser to start using the application.

Usage Examples
Initial Prompts

Create a 5-slide presentation about the benefits of remote work, with a clean and modern design.

I need a presentation on the future of artificial intelligence. Make it look futuristic with a dark theme.

Generate a pitch deck for a new coffee startup. The vibe should be warm and artisanal.

Editing and Follow-up Prompts

Change the title of slide 2.

On slide 4, change the image to a picture of a solar panel farm.

The chart on slide 3 is hard to read. Can you make it a pie chart instead?

Add a new slide after slide 2 about the challenges of remote work.

I don't like the color scheme. Can you change it to a blue and green palette?