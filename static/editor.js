// static/editor.js

(function() {
    const style = document.createElement('style');
    style.innerHTML = `
        .slide-element-selected {
            outline: 2px dashed #6A5ACD !important;
            cursor: move !important;
            position: relative; /* Needed for resize handles */
        }
        .resize-handle {
            position: absolute;
            width: 14px; height: 14px; /* Larger for mobile */
            background-color: #6A5ACD;
            border: 2px solid #fff;
            border-radius: 50%;
            z-index: 1001;
        }
        .resize-handle.se { bottom: -7px; right: -7px; cursor: se-resize; }
        .resize-handle.sw { bottom: -7px; left: -7px; cursor: sw-resize; }
        .resize-handle.nw { top: -7px; left: -7px; cursor: nw-resize; }
        .resize-handle.ne { top: -7px; right: -7px; cursor: ne-resize; }

        [contentEditable="true"].is-editing {
            cursor: text !important;
            user-select: text !important; -webkit-user-select: text !important;
        }
        body { user-select: none; -webkit-user-select: none; touch-action: none; }
    `;
    document.head.appendChild(style);

    let selectedElement = null;
    let interaction = { type: null, startPos: { x: 0, y: 0 }, startElRect: {} };
    let lastTap = 0;
    const DOUBLE_TAP_DELAY = 300;
    let savedRange = null;
    let lockedElementId = null;

    const removeResizeHandles = () => document.querySelectorAll('.resize-handle').forEach(h => h.remove());

    const createResizeHandles = (el) => {
        removeResizeHandles();
        ['nw', 'ne', 'sw', 'se'].forEach(dir => {
            const handle = document.createElement('div');
            handle.className = `resize-handle ${dir}`;
            handle.dataset.direction = dir;
            el.appendChild(handle);
            handle.addEventListener('mousedown', startInteraction);
            handle.addEventListener('touchstart', startInteraction, { passive: false });
        });
    };

    const deselectAll = () => {
        if (selectedElement) {
            if (selectedElement.classList.contains('is-editing')) selectedElement.blur();
            selectedElement.classList.remove('slide-element-selected');
            removeResizeHandles();
            selectedElement = null;
            savedRange = null;
            window.parent.postMessage({ type: 'selection_change', payload: { elementId: null, elementType: null } }, '*');
        }
    };

    const selectElement = (el) => {
        if (el === selectedElement) return;
        deselectAll();
        selectedElement = el;
        selectedElement.classList.add('slide-element-selected');
        createResizeHandles(el);
        window.parent.postMessage({
            type: 'selection_change',
            payload: { elementId: el.id, elementType: el.getAttribute('data-element-type') }
        }, '*');
    };

    const enterEditMode = (el) => {
        if (el.getAttribute('data-element-type') !== 'textbox') return;
        deselectAll(); 
        el.contentEditable = true;
        el.classList.add('is-editing');
        el.focus();
        el.addEventListener('blur', () => {
            el.contentEditable = false;
            el.classList.remove('is-editing');
            window.parent.postMessage({ type: 'element_update', payload: { elementId: el.id, newProps: { content: el.innerHTML }, property: 'content' } }, '*');
            savedRange = null;
        }, { once: true });
    };
    
    const startInteraction = (e) => {
        const target = e.currentTarget;
        const isResizeHandle = target.classList.contains('resize-handle');
        const elementToInteract = isResizeHandle ? selectedElement : target;
        
        if (lockedElementId && elementToInteract.id !== lockedElementId) return;
        
        e.stopPropagation();
        if (!isResizeHandle) {
            const currentTime = new Date().getTime();
            if (currentTime - lastTap < DOUBLE_TAP_DELAY) {
                enterEditMode(elementToInteract);
                lastTap = 0;
                return;
            }
            lastTap = currentTime;
        } else {
             e.preventDefault();
        }

        selectElement(elementToInteract);
        
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        interaction.startPos = { x: clientX, y: clientY };
        
        const computedStyle = window.getComputedStyle(selectedElement);
        interaction.startElRect = { x: parseFloat(computedStyle.left) || 0, y: parseFloat(computedStyle.top) || 0, width: parseFloat(computedStyle.width) || 0, height: parseFloat(computedStyle.height) || 0 };

        interaction.type = isResizeHandle ? 'resize' : 'drag';
        if(isResizeHandle) interaction.direction = target.dataset.direction;

        document.addEventListener('mousemove', handlePointerMove);
        document.addEventListener('touchmove', handlePointerMove, { passive: false });
        document.addEventListener('mouseup', handlePointerUp);
        document.addEventListener('touchend', handlePointerUp);
    };

    const handlePointerMove = (e) => {
        if (!interaction.type || !selectedElement || selectedElement.classList.contains('is-editing')) return;
        e.preventDefault();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        const dx = clientX - interaction.startPos.x;
        const dy = clientY - interaction.startPos.y;

        if (interaction.type === 'resize') {
            let { width, height, x, y } = interaction.startElRect;
            if (interaction.direction.includes('e')) width += dx;
            if (interaction.direction.includes('w')) { width -= dx; x += dx; }
            if (interaction.direction.includes('s')) height += dy;
            if (interaction.direction.includes('n')) { height -= dy; y += dy; }
            selectedElement.style.width = `${width}px`;
            selectedElement.style.height = `${height}px`;
            selectedElement.style.left = `${x}px`;
            selectedElement.style.top = `${y}px`;
        } else if (interaction.type === 'drag') {
            selectedElement.style.left = `${interaction.startElRect.x + dx}px`;
            selectedElement.style.top = `${interaction.startElRect.y + dy}px`;
        }
    };

    const handlePointerUp = () => {
        if (interaction.type && selectedElement) {
            window.parent.postMessage({ type: 'element_update', payload: { elementId: selectedElement.id, newProps: { style: selectedElement.getAttribute('style') } } }, '*');
        }
        interaction.type = null;
        document.removeEventListener('mousemove', handlePointerMove);
        document.removeEventListener('touchmove', handlePointerMove);
        document.removeEventListener('mouseup', handlePointerUp);
        document.removeEventListener('touchend', handlePointerUp);
    };

    const reportFormattingState = () => {
        if (!selectedElement || !selectedElement.isContentEditable) return;
        const state = {
            bold: document.queryCommandState('bold'),
            italic: document.queryCommandState('italic'),
            underline: document.queryCommandState('underline'),
            justifyLeft: document.queryCommandState('justifyLeft'),
            justifyCenter: document.queryCommandState('justifyCenter'),
            justifyRight: document.queryCommandState('justifyRight'),
            justifyFull: document.queryCommandState('justifyFull'),
            fontName: document.queryCommandValue('fontName').replace(/['"]/g, ''),
            fontSize: document.queryCommandValue('fontSize'),
            foreColor: document.queryCommandValue('foreColor'),
        };
        window.parent.postMessage({ type: 'FORMATTING_STATE_UPDATE', payload: state }, '*');
    };

    document.addEventListener('selectionchange', () => {
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
            const activeEl = document.activeElement;
            if (activeEl && activeEl.isContentEditable) {
                savedRange = selection.getRangeAt(0);
                reportFormattingState();
            }
        }
    });

    window.addEventListener('message', (event) => {
        const { type, payload } = event.data;
        if (type === 'FORMAT_TEXT') {
            if (selectedElement && selectedElement.getAttribute('data-element-type') === 'textbox') {
                selectedElement.focus();
                const selection = window.getSelection();
                if (savedRange) {
                    selection.removeAllRanges();
                    selection.addRange(savedRange);
                }
                document.execCommand(payload.command, false, payload.value || null);
                reportFormattingState();
                window.parent.postMessage({ type: 'element_update', payload: { elementId: selectedElement.id, newProps: { content: selectedElement.innerHTML }, property: 'content' } }, '*');
            }
        } else if (type === 'DELETE_ELEMENT') {
            const elToRemove = (payload && payload.elementId) ? document.getElementById(payload.elementId) : selectedElement;
            if (elToRemove) {
                if (elToRemove === selectedElement) deselectAll();
                elToRemove.remove();
                window.parent.postMessage({ type: 'SAVE_SLIDE_STATE' }, '*');
            }
        } else if (type === 'REORDER_LAYERS') {
            payload.forEach(command => {
                const el = document.getElementById(command.elementId);
                if (el) {
                    el.setAttribute('data-layer', command.newLayerIndex);
                    el.style.zIndex = 10 + command.newLayerIndex;
                }
            });
            window.parent.postMessage({ type: 'SAVE_SLIDE_STATE' }, '*');
        } else if (type === 'SET_INTERACTION_LOCK') {
            lockedElementId = payload.elementId;
            if (lockedElementId) {
                const el = document.getElementById(lockedElementId);
                if (el) selectElement(el);
            } else {
                deselectAll();
            }
        } else if (type === 'TOGGLE_VISIBILITY') {
            const el = document.getElementById(payload.elementId);
            if (el) {
                el.style.display = el.style.display === 'none' ? '' : 'none';
                window.parent.postMessage({ type: 'SAVE_SLIDE_STATE' }, '*');
            }
        }
    });

    const layeredElements = document.querySelectorAll('[data-layer]');
    layeredElements.forEach((el, index) => {
        if (!el.id) { el.id = `slide_el_${index}`; }
        const layerIndex = parseInt(el.getAttribute('data-layer'), 10) || 0;
        el.style.zIndex = 10 + layerIndex;
        el.addEventListener('mousedown', startInteraction);
        el.addEventListener('touchstart', startInteraction, { passive: false });
    });

    const handleBackgroundDown = (e) => {
        if (lockedElementId) return;
        if (!e.target.closest('[data-layer]')) { deselectAll(); }
    };
    document.body.addEventListener('mousedown', handleBackgroundDown);
    document.body.addEventListener('touchstart', handleBackgroundDown);
    
    window.parent.postMessage({ type: 'EDITOR_READY' }, '*');
})();