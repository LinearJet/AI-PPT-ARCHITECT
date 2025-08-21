// static/editor.js

// This script runs inside the iframe after the slide's HTML has been loaded.

(function() {
    const style = document.createElement('style');
    style.innerHTML = `
        /* The selection outline is purely visual and does NOT affect the z-index. */
        .slide-element-selected {
            outline: 2px dashed #6A5ACD !important;
            cursor: move !important;
            box-shadow: 0 0 15px rgba(106, 90, 205, 0.7);
        }
        [contentEditable="true"].is-editing {
            cursor: text !important;
            user-select: text !important;
            -webkit-user-select: text !important;
        }
        body {
            user-select: none;
            -webkit-user-select: none;
            touch-action: none;
        }
    `;
    document.head.appendChild(style);

    let selectedElement = null;
    let isDragging = false;
    let startPos = { x: 0, y: 0 };
    let startElPos = { x: 0, y: 0 };

    let lastTap = 0;
    const DOUBLE_TAP_DELAY = 300;

    const deselectAll = () => {
        if (selectedElement) {
            selectedElement.classList.remove('slide-element-selected');
            selectedElement = null;
            window.parent.postMessage({ type: 'selection_change', payload: { elementId: null, elementType: null } }, '*');
        }
    };

    const selectElement = (el) => {
        if (el === selectedElement) return;
        deselectAll();
        selectedElement = el;
        selectedElement.classList.add('slide-element-selected');
        window.parent.postMessage({
            type: 'selection_change',
            payload: { 
                elementId: selectedElement.id,
                elementType: selectedElement.getAttribute('data-element-type')
            }
        }, '*');
    };

    const enterEditMode = (el) => {
        if (el.getAttribute('data-element-type') !== 'textbox') return;
        el.contentEditable = true;
        el.classList.add('is-editing');
        el.focus();
        el.addEventListener('blur', () => {
            el.contentEditable = false;
            el.classList.remove('is-editing');
            window.parent.postMessage({
                type: 'element_update',
                payload: { elementId: el.id, newProps: { content: el.innerHTML } }
            }, '*');
        }, { once: true });
    };
    
    const handlePointerDown = (el, e) => {
        e.stopPropagation();
        
        const currentTime = new Date().getTime();
        const tapLength = currentTime - lastTap;
        
        if (tapLength < DOUBLE_TAP_DELAY && tapLength > 0) {
            enterEditMode(el);
            lastTap = 0;
            return; 
        } 
        lastTap = currentTime;

        selectElement(el);
        isDragging = false;
        
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        
        startPos = { x: clientX, y: clientY };
        
        const computedStyle = window.getComputedStyle(el);
        startElPos = { 
            x: parseFloat(computedStyle.left) || 0, 
            y: parseFloat(computedStyle.top) || 0
        };

        document.addEventListener('mousemove', handlePointerMove);
        document.addEventListener('touchmove', handlePointerMove, { passive: false });
        document.addEventListener('mouseup', handlePointerUp);
        document.addEventListener('touchend', handlePointerUp);
    };

    const handlePointerMove = (e) => {
        if (!selectedElement || selectedElement.classList.contains('is-editing')) return;
        e.preventDefault();

        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;

        if (!isDragging) {
            const moveThreshold = 5;
            if (Math.abs(clientX - startPos.x) > moveThreshold || Math.abs(clientY - startPos.y) > moveThreshold) {
                isDragging = true;
            }
        }

        if (isDragging) {
            let newX = startElPos.x + (clientX - startPos.x);
            let newY = startElPos.y + (clientY - startPos.y);
            selectedElement.style.left = `${newX}px`;
            selectedElement.style.top = `${newY}px`;
        }
    };

    const handlePointerUp = () => {
        if (isDragging && selectedElement) {
            window.parent.postMessage({
                type: 'element_update',
                payload: {
                    elementId: selectedElement.id,
                    newProps: { style: selectedElement.getAttribute('style') }
                }
            }, '*');
        }
        isDragging = false;
        document.removeEventListener('mousemove', handlePointerMove);
        document.removeEventListener('touchmove', handlePointerMove);
        document.removeEventListener('mouseup', handlePointerUp);
        document.removeEventListener('touchend', handlePointerUp);
    };

    window.addEventListener('message', (event) => {
        const { type, payload } = event.data;
        if (type === 'FORMAT_TEXT' && selectedElement && selectedElement.isContentEditable) {
            document.execCommand(payload.command, false, null);
            selectedElement.focus();
        }
        if (type === 'REORDER_LAYERS') {
            payload.forEach(command => {
                const el = document.getElementById(command.elementId);
                if (el) {
                    el.setAttribute('data-layer', command.newLayerIndex);
                    el.style.zIndex = 10 + command.newLayerIndex;
                }
            });
            window.parent.postMessage({ type: 'SAVE_SLIDE_STATE' }, '*');
        }
    });

    const layeredElements = document.querySelectorAll('[data-layer]');
    
    layeredElements.forEach((el, index) => {
        if (!el.id) { el.id = `slide_el_${index}`; }
        const layerIndex = parseInt(el.getAttribute('data-layer'), 10) || 0;
        el.style.zIndex = 10 + layerIndex;
        el.addEventListener('mousedown', (e) => handlePointerDown(el, e));
        el.addEventListener('touchstart', (e) => handlePointerDown(el, e));
    });

    const handleBackgroundDown = (e) => {
        if (!e.target.closest('[data-layer]')) { deselectAll(); }
    };
    document.body.addEventListener('mousedown', handleBackgroundDown);
    document.body.addEventListener('touchstart', handleBackgroundDown);

    console.log(`Editor script injected. Found and activated ${layeredElements.length} layered elements.`);
    
    // --- CRITICAL FIX: Signal to the parent window that the editor is ready ---
    window.parent.postMessage({ type: 'EDITOR_READY' }, '*');
})();