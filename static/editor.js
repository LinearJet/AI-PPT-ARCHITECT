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
            width: 10px;
            height: 10px;
            background-color: #6A5ACD;
            border: 1px solid #fff;
            border-radius: 50%;
            z-index: 1001;
        }
        .resize-handle.se { bottom: -5px; right: -5px; cursor: se-resize; }
        .resize-handle.sw { bottom: -5px; left: -5px; cursor: sw-resize; }
        .resize-handle.nw { top: -5px; left: -5px; cursor: nw-resize; }
        .resize-handle.ne { top: -5px; right: -5px; cursor: ne-resize; }

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
    let interaction = {
        active: false,
        type: null, // 'drag' or 'resize'
        direction: '',
        startPos: { x: 0, y: 0 },
        startElRect: { x: 0, y: 0, width: 0, height: 0 }
    };

    let lastTap = 0;
    const DOUBLE_TAP_DELAY = 300;

    const removeResizeHandles = () => {
        document.querySelectorAll('.resize-handle').forEach(h => h.remove());
    };

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
            selectedElement.classList.remove('slide-element-selected');
            removeResizeHandles();
            selectedElement = null;
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
            payload: { 
                elementId: selectedElement.id,
                elementType: selectedElement.getAttribute('data-element-type')
            }
        }, '*');
    };

    const enterEditMode = (el) => {
        if (el.getAttribute('data-element-type') !== 'textbox') return;
        deselectAll(); // Deselect to remove move/resize UI
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
    
    const startInteraction = (e) => {
        e.stopPropagation();
        e.preventDefault(); // Prevent default actions like text selection
        
        const target = e.currentTarget;
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;

        interaction.active = true;
        interaction.startPos = { x: clientX, y: clientY };
        
        const elementToInteract = target.classList.contains('resize-handle') ? selectedElement : target;
        selectElement(elementToInteract);
        
        const computedStyle = window.getComputedStyle(selectedElement);
        interaction.startElRect = {
            x: parseFloat(computedStyle.left) || 0,
            y: parseFloat(computedStyle.top) || 0,
            width: parseFloat(computedStyle.width) || 0,
            height: parseFloat(computedStyle.height) || 0
        };

        if (target.classList.contains('resize-handle')) {
            interaction.type = 'resize';
            interaction.direction = target.dataset.direction;
        } else {
            const currentTime = new Date().getTime();
            const tapLength = currentTime - lastTap;
            if (tapLength < DOUBLE_TAP_DELAY && tapLength > 0) {
                interaction.active = false; // Cancel move/resize
                enterEditMode(target);
                lastTap = 0;
                return;
            }
            lastTap = currentTime;
            interaction.type = 'drag';
        }

        document.addEventListener('mousemove', handlePointerMove);
        document.addEventListener('touchmove', handlePointerMove, { passive: false });
        document.addEventListener('mouseup', handlePointerUp);
        document.addEventListener('touchend', handlePointerUp);
    };

    const handlePointerMove = (e) => {
        if (!interaction.active || !selectedElement || selectedElement.classList.contains('is-editing')) return;
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
        if (interaction.active && selectedElement) {
            window.parent.postMessage({
                type: 'element_update',
                payload: {
                    elementId: selectedElement.id,
                    newProps: { style: selectedElement.getAttribute('style') }
                }
            }, '*');
        }
        interaction.active = false;
        document.removeEventListener('mousemove', handlePointerMove);
        document.removeEventListener('touchmove', handlePointerMove);
        document.removeEventListener('mouseup', handlePointerUp);
        document.removeEventListener('touchend', handlePointerUp);
    };

    window.addEventListener('message', (event) => {
        const { type, payload } = event.data;
        if (type === 'FORMAT_TEXT' && selectedElement && (selectedElement.isContentEditable || selectedElement.getAttribute('data-element-type') === 'textbox')) {
            if (!selectedElement.isContentEditable) {
                selectedElement.contentEditable = true;
                selectedElement.focus();
                selectedElement.contentEditable = false;
            } else {
                 selectedElement.focus();
            }
            document.execCommand(payload.command, false, payload.value || null);
            window.parent.postMessage({ type: 'element_update', payload: { elementId: selectedElement.id, newProps: { content: selectedElement.innerHTML } } }, '*');
        }
        if (type === 'DELETE_ELEMENT' && selectedElement) {
            const elToRemove = selectedElement;
            deselectAll();
            elToRemove.remove();
            window.parent.postMessage({ type: 'SAVE_SLIDE_STATE' }, '*');
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
        el.addEventListener('mousedown', startInteraction);
        el.addEventListener('touchstart', startInteraction, { passive: false });
    });

    const handleBackgroundDown = (e) => {
        if (!e.target.closest('[data-layer]')) { deselectAll(); }
    };
    document.body.addEventListener('mousedown', handleBackgroundDown);
    document.body.addEventListener('touchstart', handleBackgroundDown);
    
    window.parent.postMessage({ type: 'EDITOR_READY' }, '*');
})();