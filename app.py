# app.py

import os
import json
import asyncio
from flask import Flask, render_template, request, jsonify, Response, stream_with_context, send_file
from presentation_generator import PresentationAgent
from presentation_exporter import StaticImageExporter # <-- 1. IMPORT THE NEW STATIC EXPORTER
import io

app = Flask(__name__)

agent_sessions = {}

@app.route('/')
def index():
    """Serves the main HTML page."""
    return render_template('index.html')

@app.route('/api/chat', methods=['POST'])
def chat():
    """
    Handles the conversational interaction with the PresentationAgent.
    Manages agent state based on a conversation_id.
    """
    data = request.get_json()
    conv_id = data.get('conversation_id')
    history = data.get('history', [])

    if not conv_id or not history:
        return jsonify({"error": "conversation_id and history are required"}), 400

    if conv_id not in agent_sessions:
        agent_sessions[conv_id] = {
            "agent": PresentationAgent(),
            "slides_html": {} 
        }
    
    session = agent_sessions[conv_id]
    agent = session["agent"]

    def generate():
        """Streams the agent's response turn by turn."""
        try:
            for update_str in agent.run_conversation_turn(history):
                # The generator now yields the raw string, so we pass it directly
                update = json.loads(update_str.replace("data: ", ""))
                if update['type'] in ['new_slide', 'slide_update']:
                    slide_num = update['data']['slide_number']
                    session['slides_html'][slide_num] = update['data']['html']
                yield update_str
        except Exception as e:
            print(f"Error during agent execution for {conv_id}: {e}")
            error_event = f"data: {json.dumps({'type': 'error', 'data': {'message': str(e)}})}\n\n"
            yield error_event

    return Response(stream_with_context(generate()), mimetype='text/event-stream')

@app.route('/api/export', methods=['POST'])
def export_presentation():
    """Exports the current presentation state to a PPTX file."""
    data = request.get_json()
    conv_id = data.get('conversation_id')

    if not conv_id or conv_id not in agent_sessions:
        return jsonify({"error": "Invalid conversation_id"}), 400

    session = agent_sessions[conv_id]
    
    if not session["slides_html"]:
        return jsonify({"error": "No presentation has been generated yet."}), 400

    sorted_slides_html = [
        session["slides_html"][i] 
        for i in sorted(session["slides_html"].keys())
    ]

    # --- 2. USE THE NEW STATIC IMAGE EXPORTER ---
    async def run_export():
        exporter = StaticImageExporter(sorted_slides_html)
        return await exporter.export()

    try:
        pptx_data = asyncio.run(run_export())
        return send_file(
            io.BytesIO(pptx_data),
            as_attachment=True,
            download_name='presentation.pptx',
            mimetype='application/vnd.openxmlformats-officedocument.presentationml.presentation'
        )
    except Exception as e:
        print(f"Error during export for {conv_id}: {e}")
        return jsonify({"error": f"Failed to export presentation: {str(e)}"}), 500


if __name__ == '__main__':
    app.run(debug=True, port=int(os.getenv('PORT', 5000)))