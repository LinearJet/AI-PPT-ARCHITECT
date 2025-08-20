import requests
import argparse
from bs4 import BeautifulSoup
from urllib.parse import urljoin

# --- CONFIGURATION ---
SEARXNG_INSTANCE_URL = "http://127.0.0.1:8888"

def search_searxng(query: str, category: str = 'general'):
    """
    Performs a search on the local SearXNG instance and prints the results.
    """
    print(f"--- Querying SearXNG for '{query}' in category '{category}' ---")
    
    search_url = f"{SEARXNG_INSTANCE_URL}/search"
    
    post_data = {
        'q': query,
        'categories': category,
        'language': 'en'
    }
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Referer": f"{SEARXNG_INSTANCE_URL}/",
        "Content-Type": "application/x-www-form-urlencoded",
        "Origin": SEARXNG_INSTANCE_URL,
    }

    try:
        # Increased client-side timeout to be more patient than the server
        response = requests.post(search_url, data=post_data, headers=headers, timeout=30)
        response.raise_for_status()
        
        print(f"--- Status Code: {response.status_code} ---")
        
        with open("cli_debug_output.html", "w", encoding="utf-8") as f:
            f.write(response.text)
        print("--- Raw HTML response saved to cli_debug_output.html ---")

        soup = BeautifulSoup(response.text, 'html.parser')
        
        no_results_div = soup.select_one("div#results_info")
        if no_results_div and "No results found" in no_results_div.get_text():
            print("\n--- SearXNG returned 'No results found'. The server is working but found no images for this query. ---")
            return

        if category == 'images':
            image_results = soup.select("article.result-images")
            if image_results:
                print(f"\n--- Found {len(image_results)} Image Results ---")
                for i, res in enumerate(image_results, 1):
                    link_tag = res.select_one("a")
                    img_tag = res.select_one("img.image_thumbnail")
                    title_tag = res.select_one("span.title")
                    
                    full_image_url = link_tag['href'] if link_tag else "N/A"
                    thumbnail_url = img_tag['src'] if img_tag else "N/A"
                    title = title_tag.get_text(strip=True) if title_tag else "N/A"

                    print(f"\nImage #{i}:")
                    print(f"  Title: {title}")
                    print(f"  Thumbnail URL: {thumbnail_url}")
                    print(f"  Full Image URL: {full_image_url}")
            else:
                print("\n--- No image results found with selector 'article.result-images'. Inspect cli_debug_output.html. ---")

        else: # General search
            results = soup.select("article.result")
            if results:
                print(f"\n--- Found {len(results)} General Results ---")
                for i, res in enumerate(results, 1):
                    title_tag = res.select_one("h3 > a")
                    content_tag = res.select_one("p.result-content")
                    
                    title = title_tag.get_text(strip=True) if title_tag else "N/A"
                    url = title_tag['href'] if title_tag else "N/A"
                    content = content_tag.get_text(strip=True) if content_tag else "N/A"
                    
                    print(f"\nResult #{i}:")
                    print(f"  Title: {title}")
                    print(f"  URL: {url}")
                    print(f"  Content: {content}")
            else:
                print("\n--- No general results found with selector 'article.result'. Inspect cli_debug_output.html. ---")


    except requests.RequestException as e:
        print(f"\n--- ERROR ---")
        print(f"Failed to connect to SearXNG instance at {SEARXNG_INSTANCE_URL}")
        print(f"Error details: {e}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="CLI tool to scrape search results from a local SearXNG instance.")
    parser.add_argument("query", type=str, help="The search query.")
    parser.add_argument("-c", "--category", type=str, default="general", help="The search category (e.g., 'general', 'images').")
    
    args = parser.parse_args()
    
    search_searxng(args.query, args.category)