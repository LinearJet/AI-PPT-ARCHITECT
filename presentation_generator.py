# presentation_generator.py

import os
import json
import time
import requests
from google import genai
from google.genai import types
from dotenv import load_dotenv

load_dotenv()

# Use a model that supports thinking, as per user's example and notebook
MODEL_ID = "gemini-2.5-flash-lite"
# Define a reusable thinking configuration
THINKING_CONFIG = types.ThinkingConfig(thinking_budget=4096)

# --- CRITICAL FIX: Remove failing public instances, use local only ---
SEARXNG_INSTANCE_URLS = [
    "http://127.0.0.1:8888",     # Local instance is more reliable
]
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
}
REQUEST_TIMEOUT = 25
IMAGE_SEARCH_RETRIES = 2 # How many times to try different queries

class InfographicsAgent:
    """
    A specialized agent to generate rich, data-driven infographic slides.
    """
    def __init__(self):
        self.client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

    def _call_llm(self, prompt):
        """Calls the LLM with thinking enabled."""
        config = types.GenerateContentConfig(
            temperature=0.8,
            thinking_config=THINKING_CONFIG
        )
        response = self.client.models.generate_content(
            model=MODEL_ID,
            contents=prompt,
            config=config
        )
        return response

    def generate_html(self, description, data_snippets):
        prompt = f"""
        You are a world-class data visualization artist and creative technologist.
        Your task is to create a single, self-contained, visually stunning HTML file for a presentation slide.
        This is not a standard slide; it is a dynamic, high-effort infographic.

        **Concept Description:** {description}
        **Supporting Data Snippets:**
        ---
        {data_snippets}
        ---

        **CRITICAL Design & Technology Requirements:**
        1.  **Self-Contained HTML:** The output MUST be a single HTML file. All CSS and JavaScript must be embedded in `<style>` and `<script>` tags.
        2.  **Modern Libraries:** Use modern, powerful libraries for visualization.
            - For complex data viz, charts, and graphs: Use **D3.js** or **Chart.js**.
            - For diagrams and flowcharts: Use **Mermaid.js**.
            - For 3D elements: Use **Three.js**.
            - Load libraries from a reliable CDN (e.g., cdnjs).
        3.  **Visual Excellence:** This is paramount. Do not create a simple chart on a white background.
            - **Composition:** Think about layout, balance, and visual flow. Use CSS Grid or Flexbox for sophisticated arrangements.
            - **Color Palette:** Use a modern, harmonious color palette.
            - **Typography:** Use Google Fonts to enhance readability and style.
            - **Animation & Interactivity:** Add subtle animations (e.g., on-load transitions, hover effects) to make the infographic feel alive. The visualization should be engaging.
        4.  **Data Integration:** The visualization MUST accurately represent the provided `data_snippets`. Synthesize the data into a compelling narrative.
        5.  **Emoji/Visual Manipulation:** As requested, you can creatively manipulate emojis or construct visuals using HTML/CSS/JS to create unique infographic elements where appropriate.
        6.  **Code Quality:** Write clean, well-commented HTML, CSS, and JavaScript.

        **Output ONLY the complete, raw HTML code starting with `<!DOCTYPE html>`. No explanations, no markdown.**
        """
        response = self._call_llm(prompt)
        return response.text.strip().replace("```html", "").replace("```", "")


class PresentationAgent:
    """
    An agent that orchestrates the creation and editing of a professional presentation
    through a conversational interface.
    """
    def __init__(self):
        self.client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
        self.presentation_plan = None # This will store the state of our presentation

    def _call_llm(self, prompt, enable_thinking=False):
        config = types.GenerateContentConfig(temperature=0.8)
        if enable_thinking:
            config.thinking_config = THINKING_CONFIG
        
        response = self.client.models.generate_content(
            model=MODEL_ID,
            contents=prompt,
            config=config
        )
        return response

    def _yield_event(self, event_type, data):
        return f"data: {json.dumps({'type': event_type, 'data': data})}\n\n"

    def _generate_image_search_query(self, topic, slide_title, slide_body):
        prompt = f"""
        Based on the presentation topic '{topic}' and slide content, generate a concise, 2-4 word image search query.
        The query should capture the visual essence.
        CRITICAL: Do NOT include generic words like 'image', 'photo', 'professional'. Focus on core nouns and concepts.

        Slide Title: "{slide_title}"
        Slide Body: "{slide_body[:250]}..."
        Optimal Image Search Query:
        """
        try:
            response = self._call_llm(prompt)
            return response.text.strip().replace('"', '')
        except Exception:
            return f"{topic} {slide_title}"

    def _regenerate_image_search_query(self, topic, slide_title, original_query):
        """Asks the LLM to come up with a different search query if the first one failed."""
        prompt = f"""
        You are a creative assistant. The image search query '{original_query}' failed to find good results for a slide titled '{slide_title}' in a presentation about '{topic}'.
        Generate a different, creative 2-4 word alternative search query. Try a more abstract or conceptual approach.

        New Optimal Image Search Query:
        """
        try:
            response = self._call_llm(prompt)
            return response.text.strip().replace('"', '')
        except Exception:
            return f"{topic} abstract" # A simple fallback

    def _is_high_quality_image(self, url: str) -> bool:
        """
        A heuristic-based filter to avoid low-quality images like logos, icons, and SVGs.
        """
        if not url:
            return False
        
        url_lower = url.lower()
        bad_extensions = ['.svg', '.gif']
        if any(url_lower.endswith(ext) for ext in bad_extensions):
            print(f"Filtering out image due to extension: {url}")
            return False

        bad_keywords = ['logo', 'icon', 'thumb', 'avatar', 'sprite', 'favicon', 'badge', '100x100', '150x150']
        if any(keyword in url_lower for keyword in bad_keywords):
            print(f"Filtering out image due to keyword: {url}")
            return False
            
        bad_domains = ['artic.edu']
        if any(domain in url_lower for domain in bad_domains):
            print(f"Filtering out image due to domain: {url}")
            return False

        return True

    def _search_for_image(self, query):
        """Searches for an image using a list of SearXNG instances via their JSON API."""
        for base_url in SEARXNG_INSTANCE_URLS:
            print(f"Searching for image via SearXNG instance '{base_url}': {query}")
            search_url = f"{base_url}/search"
            params = {'q': query, 'categories': 'images', 'language': 'en', 'format': 'json'}
            
            try:
                response = requests.get(search_url, params=params, timeout=REQUEST_TIMEOUT, headers=HEADERS)
                response.raise_for_status()
                results = response.json()
                
                image_results = results.get('results', [])
                if not image_results:
                    print(f"Instance '{base_url}' returned no images for query '{query}'.")
                    return None

                for img in image_results:
                    image_url = img.get('img_src')
                    if self._is_high_quality_image(image_url):
                        print(f"Success! Found high-quality image URL: {image_url}")
                        return image_url
                
                print("No high-quality images found, returning the first result as a fallback.")
                if image_results:
                    return image_results[0].get('img_src')

            except requests.RequestException as e:
                print(f"Could not connect to SearXNG instance at {base_url}. Is it running? Error: {e}. Trying next instance...")
                continue
            except Exception as e:
                print(f"SearXNG image search failed for '{query}' at '{base_url}': {e}")
                return None
        
        print("All SearXNG instances failed.")
        return None

    def _search_for_data(self, query):
        """Searches for textual data/facts using SearXNG's JSON API."""
        print(f"Searching for data with query: '{query}'")
        for base_url in SEARXNG_INSTANCE_URLS:
            search_url = f"{base_url}/search"
            params = {'q': query, 'categories': 'general', 'language': 'en', 'format': 'json'}
            try:
                response = requests.get(search_url, params=params, timeout=REQUEST_TIMEOUT, headers=HEADERS)
                response.raise_for_status()
                results = response.json()
                
                snippets = []
                for item in results.get('results', [])[:5]: # Get top 5 results
                    title = item.get('title', '')
                    content = item.get('content', '')
                    if title and content:
                        snippets.append(f"Title: {title}\nSnippet: {content}")
                
                if snippets:
                    print(f"Successfully found data snippets for '{query}'")
                    return "\n\n".join(snippets)
                
            except requests.RequestException as e:
                print(f"Could not connect to SearXNG instance at {base_url} for data search. Error: {e}. Trying next instance...")
                continue
            except Exception as e:
                print(f"Data search failed for '{query}' at '{base_url}': {e}")
                return None
        
        print("All SearXNG instances failed for data search.")
        return None

    def _get_chart_data_from_search(self, data_query, chart_type):
        """Generator that searches for data, processes it with an LLM, and yields updates."""
        yield self._yield_event('status_update', {'message': f"Searching for data to build chart: '{data_query}'..."})
        search_results = self._search_for_data(data_query)
        if not search_results:
            yield self._yield_event('status_update', {'message': f"Could not find any data for '{data_query}'."})
            return None

        yield self._yield_event('status_update', {'message': "Found data. Asking AI to structure it for the chart..."})
        
        prompt = f"""
        You are a data analysis expert. Based on the provided search results, extract and structure data to create a '{chart_type}' chart.
        The data should be factual and directly supported by the search results.

        **Search Results:**
        ---
        {search_results}
        ---

        **Your Task:**
        Generate a JSON object with "labels" and "datasets". "datasets" should be a list of objects, each with a "label" and "data" array.
        The length of the "data" array MUST match the length of the "labels" array.
        Example for a bar chart:
        {{
            "labels": ["Category A", "Category B", "Category C"],
            "datasets": [
                {{
                    "label": "Value in Millions",
                    "data": [10, 25, 15]
                }}
            ]
        }}

        **CRITICAL: Output ONLY the raw JSON object.**
        """
        try:
            response = self._call_llm(prompt)
            # Clean potential markdown formatting from the response
            cleaned_response = response.text.strip().replace("```json", "").replace("```", "")
            chart_data = json.loads(cleaned_response)
            if 'labels' in chart_data and 'datasets' in chart_data:
                return chart_data
            else:
                print("LLM response for chart data was missing 'labels' or 'datasets'.")
                return None
        except Exception as e:
            print(f"Failed to structure chart data with LLM: {e}")
            return None

    def _generate_slide_html(self, slide_data, theme_data, style):
        prompt = f"""
        You are an expert HTML/CSS designer with a keen eye for artistic composition, creating a slide with a '{style}' feel.
        The output must be a complete, self-contained HTML document.

        **Theme Data:** {json.dumps(theme_data)}
        **Slide Data:** {json.dumps(slide_data)}

        **CRITICAL Design & Code Instructions:**
        1.  **HTML Structure:** Generate a complete HTML document starting with `<!DOCTYPE html>`.
        2.  **Styling:** Use Tailwind CSS via its CDN. Embed all custom CSS within a `<style>` tag in the `<head>`.
        3.  **Fonts:** Import the specific Google Fonts defined in the theme's `fontPairing`.
        4.  **Backgrounds:** If the theme contains a `backgroundStyle` object (e.g., a gradient), apply it to the `<body>`. Otherwise, use the solid `backgroundColor`.
        5.  **Dynamic Image Styling (`image_styles`):** If this list exists, it is the primary instruction for image rendering.
            a. For each object in `image_styles`, create an absolutely positioned `<div>` wrapper.
            b. Apply the `position` values (`left`, `top`, `width`, `height`) to this wrapper.
            c. Inside the wrapper, place the `<img>` tag (using the corresponding URL from `image_urls`) with `w-full h-full object-cover` classes.
            d. **Shape Clipping:** Apply a `clip-path` to the wrapper based on the `shape` property. Use a `<style>` tag for complex clip-paths.
                - `circle`: Use Tailwind's `rounded-full` class.
                - `pill`: Use Tailwind's `rounded-full` class.
                - `trapezoid`: Use `clip-path: polygon(20% 0%, 80% 0%, 100% 100%, 0% 100%);`
                - `parallelogram`: Use `clip-path: polygon(25% 0%, 100% 0%, 75% 100%, 0% 100%);`
                - `kite`: Use `clip-path: polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%);`
            e. **Emphasis:** Apply Tailwind shadow classes (e.g., `shadow-2xl`) based on the `shadow` property.
        6.  **Standard Image Layouts:** If `image_styles` is NOT present but `image_urls` is, use the `layout` property to create a balanced grid or column layout.
        7.  **Charts (`chart`):** If a `chart` object with `data` exists, render it using Chart.js.
        8.  **Shapes (`shapes`):** If `shapes` exists, render them as inline SVG elements with absolute positioning.
        9.  **Content:** Place the `title` and `body` thoughtfully, ensuring readability and harmony with the visual elements.
        10. **Output ONLY the HTML code.** No explanations or markdown formatting.
        """
        response = self._call_llm(prompt)
        return response.text.strip().replace("```html", "").replace("```", "")

    def run_conversation_turn(self, conversation_history):
        """Main entry point for the agent for each user message."""
        if self.presentation_plan is None:
            yield from self._create_new_presentation(conversation_history[-1]['content'])
        else:
            yield from self._edit_presentation(conversation_history)

    def _create_new_presentation(self, user_prompt):
        """Workflow for generating a presentation from scratch."""
        yield self._yield_event('status_update', {'message': "Understood. I will begin by creating a concept for your presentation."})
        
        topic_style_prompt = f"""
        Analyze the user's request to differentiate between the core subject matter (the topic) and a specific design instruction (the theme_hint).
        User's Request: '{user_prompt}'
        Output a single, raw JSON object with "topic" and "theme_hint" keys.
        """
        topic_style_response = self._call_llm(topic_style_prompt)
        try:
            parsed_response = json.loads(topic_style_response.text.strip().replace("```json", "").replace("```", ""))
            topic = parsed_response.get('topic', user_prompt)
            theme_hint = parsed_response.get('theme_hint')
        except json.JSONDecodeError:
            topic, theme_hint = user_prompt, None

        style = theme_hint or topic

        yield self._yield_event('status_update', {'message': f"Acting as a creative director for a presentation on '{topic}' with a '{style}' theme. I will now devise a unique visual identity and a comprehensive slide outline."})

        plan_prompt = f"""
        You are a world-class presentation designer and visual artist. Your design philosophy is rooted in dynamic composition and clarity. Create a complete visual and content plan.
        **Topic:** '{topic}'
        **Theme Hint:** '{theme_hint if theme_hint else "None provided; derive theme from the topic."}'

        **Your Task & Design Principles:**
        1.  **Visual Theme:** Invent a unique, professional theme with colors and fonts. Optionally add a `backgroundStyle` for gradients.
        2.  **Content & Layouts:** Determine slide count, write concise text, and choose a base `layout`.
        3.  **Visual Elements (Use Purposefully):**
            *   **Charts & Graphs:** If data is needed, include a `chart` object with a `type` and `data_query`.
            *   **NEW - Infographics:** For complex data stories, you can use the layout type `"infographic"`. An infographic slide should have a `description` of the visual concept and a `data_query` to fetch the necessary information.
            *   **Decorative Shapes:** Add a `shapes` list for visual interest.
            *   **Dynamic Image Styling:** For slides with images, you can now add an `image_styles` list. This is for artistic placement and shaping, overriding the base `layout`.
                *   Each object in the list corresponds to an image from `image_search_queries`.
                *   It can contain: `"shape"`: `"circle"`, `"pill"`, `"trapezoid"`, `"parallelogram"`, `"kite"`.
                *   It can contain: `"position"`: An object with `"x"`, `"y"`, `"width"`, `"height"` as percentage strings (e.g., `"x": "10%"`).
                *   It can contain: `"shadow"`: A Tailwind shadow class like `"shadow-lg"` or `"shadow-2xl"`.
                *   Use this to create focus points and visually engaging, asymmetrical compositions.
        4.  **Title Slide Rule:** The first slide MUST use a `background_image_content_overlay` layout and have one image query.
        
        **CRITICAL: Output a single, raw, valid JSON object with "theme" and "slides" as top-level keys.**
        """
        plan_response = self._call_llm(plan_prompt, enable_thinking=True)
        
        try:
            plan = json.loads(plan_response.text.strip().replace("```json", "").replace("```", ""))
            if 'slides' not in plan or 'theme' not in plan:
                raise KeyError("The generated plan is missing 'slides' or 'theme' key.")
            self.presentation_plan = plan
        except (json.JSONDecodeError, KeyError) as e:
            print(f"Error parsing or validating presentation plan: {e}")
            yield self._yield_event('status_update', {'message': "I'm sorry, I had trouble creating a valid presentation plan. Could you please try rephrasing your request?"})
            return

        yield self._yield_event('status_update', {'message': "Creative plan complete. I will now source visuals and design the slides."})
        yield from self._process_and_generate_slides(range(len(self.presentation_plan['slides'])))
        yield self._yield_event('status_update', {'message': "I've completed the presentation! How does it look?"})

    def _edit_presentation(self, conversation_history):
        """Workflow for editing an existing presentation."""
        yield self._yield_event('status_update', {'message': "Got it. I will revise the presentation based on your feedback."})
        
        edit_prompt = f"""
        You are a JSON transformation engine. Your sole purpose is to update the provided JSON object based on the user's latest request, following the rules precisely.
        Your primary goal is to produce a valid JSON object that reflects the user's change.

        **CRITICAL INSTRUCTIONS FOR MODIFICATION:**
        - **To change an image:** You MUST delete the `image_urls` key from the relevant slide and add a new `image_search_queries` key with new search terms. This is the ONLY way to trigger a new image search.
        - **To change a chart:** You MUST delete the `chart.data` key and add a `chart.data_query` key.
        - **To change image shape/position:** Modify the `image_styles` list for the slide. You can add this list if it doesn't exist to create a dynamic layout.
        - **For all other changes:** Modify text, layouts, or decorative `shapes` as needed.

        **Current Presentation Plan (JSON):** {json.dumps(self.presentation_plan, indent=2)}
        **Conversation History:** {json.dumps(conversation_history, indent=2)}
        
        **User's Last Request:** "{conversation_history[-1]['content']}"

        **CRITICAL: Respond with the *complete, updated* presentation plan as a single, raw JSON object. Do not add any explanations or markdown formatting.**
        """
        edit_response = self._call_llm(edit_prompt, enable_thinking=True)
        try:
            new_plan = json.loads(edit_response.text.strip().replace("```json", "").replace("```", ""))
        except json.JSONDecodeError:
            yield self._yield_event('status_update', {'message': "I'm sorry, I had trouble applying those changes. Could you try rephrasing?"})
            return

        if new_plan == self.presentation_plan:
            yield self._yield_event('status_update', {'message': "It seems my first attempt didn't work. Let me try that again more directly..."})
            retry_prompt = f"""
            Your previous attempt to edit the presentation plan failed. You MUST apply the user's last request to the presentation plan.

            **CRITICAL INSTRUCTIONS FOR CHANGING VISUALS:**
            - **To change an image:** Delete `image_urls` and add `image_search_queries` with new terms.
            - **To change a chart:** Delete `chart.data` and add a `chart.data_query`.
            - **To change image shape/position:** Modify the `image_styles` list for the slide.

            **Current Presentation Plan (JSON):** {json.dumps(self.presentation_plan, indent=2)}
            **User's Last Request:** "{conversation_history[-1]['content']}"
            **Updated Presentation Plan (JSON):**
            """
            retry_response = self._call_llm(retry_prompt, enable_thinking=True)
            try:
                new_plan = json.loads(retry_response.text.strip().replace("```json", "").replace("```", ""))
            except json.JSONDecodeError:
                yield self._yield_event('status_update', {'message': "I'm still having trouble with that request. Could you try a different wording?"})
                return

        changed_indices = [i for i, (new_s, old_s) in enumerate(zip(new_plan.get('slides', []), self.presentation_plan.get('slides', []))) if new_s != old_s]
        
        # Detect newly added slides
        if len(new_plan.get('slides', [])) > len(self.presentation_plan.get('slides', [])):
            new_indices = range(len(self.presentation_plan.get('slides', [])), len(new_plan.get('slides', [])))
            changed_indices.extend(new_indices)

        if new_plan.get('theme') != self.presentation_plan.get('theme'):
            changed_indices = list(range(len(new_plan.get('slides', []))))

        self.presentation_plan = new_plan
        if changed_indices:
            unique_indices = sorted(list(set(changed_indices)))
            yield self._yield_event('status_update', {'message': f"Revising slide(s): {', '.join(str(i+1) for i in unique_indices)}..."})
            yield from self._process_and_generate_slides(unique_indices, is_update=True)
        
        yield self._yield_event('status_update', {'message': "Revisions complete. What's next?"})

    def _process_and_generate_slides(self, indices_to_process, is_update=False):
        """Shared logic for data/image sourcing and HTML generation for a list of slides."""
        topic = self.presentation_plan.get('title', '')
        style = "Professional" 
        theme = self.presentation_plan.get('theme', {})
        total_slides_before_update = len(self.presentation_plan['slides'])

        for i in indices_to_process:
            if i >= len(self.presentation_plan['slides']): continue # Skip if index is out of bounds
            slide_data = self.presentation_plan['slides'][i]

            # --- Handle Infographics ---
            if slide_data.get('layout') == 'infographic':
                yield self._yield_event('status_update', {'message': f"Searching for data for infographic on slide {i+1}..."})
                data_query = slide_data.get('data_query')
                html_content = ""
                if data_query:
                    search_results = self._search_for_data(data_query)
                    if search_results:
                        yield self._yield_event('status_update', {'message': f"Data found. Generating infographic for slide {i+1}..."})
                        infographics_agent = InfographicsAgent()
                        html_content = infographics_agent.generate_html(slide_data.get('description', ''), search_results)
                    else:
                        yield self._yield_event('status_update', {'message': f"Could not find data for infographic. Creating placeholder."})
                        html_content = "<html><body><h1>Infographic</h1><p>Data could not be loaded.</p></body></html>"
                else:
                    html_content = "<html><body><h1>Infographic</h1><p>No data query provided.</p></body></html>"
                
                event_type = 'slide_update' if is_update and i < total_slides_before_update else 'new_slide'
                event_data = {
                    'html': html_content, 
                    'slide_number': i + 1, 
                    'total_slides': len(self.presentation_plan['slides']),
                    'animations': slide_data.get('animations', {})
                }
                if not is_update and i == 0:
                    event_data['theme'] = theme
                elif is_update and theme != self.presentation_plan.get('theme'):
                        event_data['theme'] = theme
                yield self._yield_event(event_type, event_data)
                time.sleep(0.5)
                continue # Move to the next slide index

            # --- Handle Charts (Data Sourcing) ---
            if "chart" in slide_data and "data_query" in slide_data["chart"] and "data" not in slide_data["chart"]:
                chart_info = slide_data["chart"]
                # Use a generator to get data and yield status updates
                chart_data_generator = self._get_chart_data_from_search(chart_info["data_query"], chart_info["type"])
                structured_data = None
                try:
                    while True:
                        # Yield status updates from the chart data generator
                        yield next(chart_data_generator)
                except StopIteration as e:
                    # The generator returns the final data via StopIteration's value
                    structured_data = e.value
                
                if structured_data:
                    slide_data["chart"]["data"] = structured_data
                # Always remove the data_query to prevent re-fetching
                if "data_query" in slide_data["chart"]:
                    del slide_data["chart"]["data_query"]

            # --- Handle Images (Sourcing) ---
            if "image_search_queries" in slide_data:
                slide_data["image_urls"] = []
                for query in slide_data["image_search_queries"]:
                    yield self._yield_event('status_update', {'message': f"Sourcing visual for slide {i+1}: '{query}'..."})
                    
                    image_url = None
                    current_query = query
                    for attempt in range(IMAGE_SEARCH_RETRIES):
                        image_url = self._search_for_image(current_query)
                        if image_url:
                            break
                        else:
                            yield self._yield_event('status_update', {'message': f"Search for '{current_query}' failed. Trying a different query..."})
                            current_query = self._regenerate_image_search_query(topic, slide_data.get('title', ''), current_query)
                    
                    if image_url:
                        slide_data["image_urls"].append(image_url)
                del slide_data["image_search_queries"]

            # --- Generate HTML ---
            yield self._yield_event('status_update', {'message': f"Designing slide {i+1}: '{slide_data.get('title')}'..."})
            html_content = self._generate_slide_html(slide_data, theme, style)
            event_type = 'slide_update' if is_update and i < total_slides_before_update else 'new_slide'
            event_data = {
                'html': html_content, 
                'slide_number': i + 1, 
                'total_slides': len(self.presentation_plan['slides']),
                'animations': slide_data.get('animations', {})
            }
            if not is_update and i == 0:
                event_data['theme'] = theme
            elif is_update and theme != self.presentation_plan.get('theme'):
                 event_data['theme'] = theme
            yield self._yield_event(event_type, event_data)
            time.sleep(0.5)