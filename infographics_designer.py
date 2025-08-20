# infographics_designer.py

import os
import json
import requests
import google.genai as genai
from google.genai import types

# --- Configuration & Dependencies ---
# These settings are copied from the main generator for consistency.
SEARXNG_INSTANCE_URLS = ["http://127.0.0.1:8888"]
HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"}
REQUEST_TIMEOUT = 25

# --- Tool Definition ---

def search_for_infographic_data(query: str):
    """
    Searches for textual data/facts using SearXNG's JSON API.
    Args:
        query: The search query string.
    Returns:
        A formatted string of the top 5 search result snippets, or an error message.
    """
    print(f"--- INFOGRAPHICS AGENT: Performing data search for: '{query}' ---")
    for base_url in SEARXNG_INSTANCE_URLS:
        search_url = f"{base_url}/search"
        params = {'q': query, 'categories': 'general', 'language': 'en', 'format': 'json'}
        try:
            response = requests.get(search_url, params=params, timeout=REQUEST_TIMEOUT, headers=HEADERS)
            response.raise_for_status()
            results = response.json()
            
            snippets = []
            for item in results.get('results', [])[:5]:
                title = item.get('title', '')
                content = item.get('content', '')
                if title and content:
                    snippets.append(f"Title: {title}\nSnippet: {content}")
            
            if snippets:
                print(f"--- INFOGRAPHICS AGENT: Successfully found data snippets for '{query}' ---")
                return "\n\n".join(snippets)
            return "No search results found."
        except Exception as e:
            print(f"--- INFOGRAPHICS AGENT: Data search failed for '{query}': {e} ---")
            return f"An error occurred during search: {e}"

# Define the tool for the model to use, following the Gemini tool-use pattern.
infographics_search_tool = types.Tool(
    function_declarations=[
        types.FunctionDeclaration(
            name='search_for_infographic_data',
            description='Provides up-to-date information from the internet to build data visualizations and infographics.',
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={'query': types.Schema(type=types.Type.STRING, description='The search query to find data for the infographic.')},
                required=['query']
            )
        )
    ]
)

class InfographicsAgent:
    """
    A specialist agent that uses a tool to find data and then designs
    a high-quality, self-contained infographic slide in HTML.
    """
    def __init__(self, theme_data):
        # Use a more powerful model for high-quality creative design tasks.
        self.model = genai.GenerativeModel("gemini-2.5-pro-preview-06-05")
        self.theme = theme_data

    def _yield_event(self, event_type, data):
        """Helper to format server-sent events."""
        return f"data: {json.dumps({'type': event_type, 'data': data})}\n\n"

    def create_infographic(self, topic, data_query, slide_title):
        """
        Generator that orchestrates the two-step process of creating an infographic.
        1. Call the model to force it to use the search tool.
        2. Call the model again with the search results to design the HTML.
        Yields status updates and returns the final HTML content.
        """
        yield self._yield_event('status_update', {'message': f"Engaging Infographics Specialist for '{slide_title}'..."})

        # --- Step 1: Reason and Act (Use the Search Tool) ---
        instruction = f"You are an Infographics Specialist. Your first step is to gather data for an infographic about '{topic}'. You MUST use the `search_for_infographic_data` tool with the query: '{data_query}'. Do not answer from your own knowledge."
        
        try:
            # Make a blocking call to the model to get the function call
            response = self.model.generate_content(
                instruction,
                tools=[infographics_search_tool],
                tool_config={'function_calling_config': 'ANY'}
            )
            
            function_call = response.candidates[0].content.parts[0].function_call
            if not function_call or function_call.name != 'search_for_infographic_data':
                raise ValueError("Model did not call the required search tool.")

        except Exception as e:
            print(f"Infographics agent failed to call tool: {e}")
            yield self._yield_event('status_update', {'message': "Specialist had trouble initiating data search. Aborting."})
            return f"<html><body><h1>Error</h1><p>Could not generate infographic: {e}</p></body></html>"

        # --- Step 2: Execute the Tool ---
        yield self._yield_event('status_update', {'message': "Specialist is searching for data..."})
        tool_result = search_for_infographic_data(query=dict(function_call.args).get('query', data_query))

        # --- Step 3: Synthesize (Design the Infographic with Data) ---
        yield self._yield_event('status_update', {'message': "Data found. Specialist is now designing the visual..."})

        design_prompt = f"""
        You are a world-class visual designer and HTML/CSS artist. Create a visually stunning, high-effort, and high-quality infographic slide.
        The output must be a complete, self-contained HTML document.

        **Topic:** {topic}
        **Slide Title:** {slide_title}
        **Theme Data:** {json.dumps(self.theme)}
        **Data Found from Research:**
        ---
        {tool_result}
        ---

        **CRITICAL Design & Code Instructions:**
        1.  **HTML Structure:** Generate a complete HTML document starting with `<!DOCTYPE html>`.
        2.  **Styling:** Use Tailwind CSS via its CDN. Embed all custom CSS within a `<style>` tag in the `<head>`.
        3.  **Fonts:** Import the specific Google Fonts defined in the theme's `fontPairing`.
        4.  **Background:** Apply the theme's `backgroundColor` or `backgroundStyle` to the `<body>`.
        5.  **Visual Concept:** Based on the data, create a powerful visual metaphor. Do NOT just list the data. Visualize it.
            *   Use a combination of large, bold typography, icons (from a library like Font Awesome or as inline SVGs), and clever layouts.
            *   You can use emojis, but style them to look professional (e.g., `font-size`, `filter: grayscale(1)`).
            *   Use DIVs with creative borders, backgrounds, and `clip-path` to represent concepts.
            *   The design should be clean, modern, and impactful.
        6.  **Content:** Integrate the slide `title` and key data points from your research into the design. Ensure text is readable and contrasts well with the background.
        7.  **Output ONLY the HTML code.** No explanations or markdown formatting.
        """

        try:
            design_response = self.model.generate_content(design_prompt)
            final_html = design_response.text.strip().replace("```html", "").replace("```", "")
            yield self._yield_event('status_update', {'message': "Specialist has completed the design."})
            return final_html
        except Exception as e:
            print(f"Infographics agent failed during design phase: {e}")
            yield self._yield_event('status_update', {'message': "Specialist encountered a design issue. Aborting."})
            return f"<html><body><h1>Error</h1><p>Could not generate infographic design: {e}</p></body></html>"