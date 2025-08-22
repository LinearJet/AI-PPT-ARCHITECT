document.addEventListener('DOMContentLoaded', () => {
    let finalSlides = []; 
    let currentSlideIndex = 0;
    let conversationHistory = [];
    let conversationId = `conv_${Date.now()}`;
    let selectedElementInfo = { id: null, type: null };
    let lockedElementId = null;

    const slideSorterBody = document.getElementById('slide-sorter-body');
    const chatLog = document.getElementById('chat-log');
    const messageInput = document.getElementById('message-input');
    const sendBtn = document.getElementById('send-btn');
    const slideIframe = document.getElementById('slide-iframe');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const slideCounter = document.getElementById('slide-counter');
    const exportBtn = document.getElementById('export-btn');
    const layersList = document.getElementById('layers-list');
    const canvasWrapper = document.getElementById('canvas-wrapper');
    const slideIframeContainer = document.getElementById('slide-iframe-container');
    
    // Home Toolbar Elements
    const fontFamilySelect = document.getElementById('select-font-family');
    const fontSizeSelect = document.getElementById('select-font-size');
    const colorInput = document.getElementById('input-color');
    const btnBold = document.getElementById('btn-bold');
    const btnItalic = document.getElementById('btn-italic');
    const btnUnderline = document.getElementById('btn-underline');
    const btnAlignLeft = document.getElementById('btn-align-left');
    const btnAlignCenter = document.getElementById('btn-align-center');
    const btnAlignRight = document.getElementById('btn-align-right');
    const btnAlignJustify = document.getElementById('btn-align-justify');
    const textFormatControls = [ fontFamilySelect, fontSizeSelect, colorInput, btnBold, btnItalic, btnUnderline, btnAlignLeft, btnAlignCenter, btnAlignRight, btnAlignJustify ];
    const btnDelete = document.getElementById('btn-delete');

    // Insert Toolbar Elements
    const toolbarTabs = document.querySelectorAll('.toolbar-tab');
    const btnInsertTextbox = document.getElementById('btn-insert-textbox');
    const btnInsertImageLocal = document.getElementById('btn-insert-image-local');
    const btnInsertImageSearch = document.getElementById('btn-insert-image-search');
    const imageUploadInput = document.getElementById('image-upload-input');
    const shapeDropdownOptions = document.querySelectorAll('.shape-dropdown a');
    const iconDropdownOptions = document.querySelectorAll('.icon-dropdown a');
    const btnInsertChart = document.getElementById('btn-insert-chart');
    const btnInsertTable = document.getElementById('btn-insert-table');
    const btnInsertVideo = document.getElementById('btn-insert-video');

    // Modals
    const modals = document.querySelectorAll('.modal-backdrop');
    const imageSearchModal = document.getElementById('image-search-modal');
    const chartModal = document.getElementById('chart-modal');
    const tableModal = document.getElementById('table-modal');
    const videoModal = document.getElementById('video-modal');

    // Event Listeners
    sendBtn.addEventListener('click', handleSendMessage);
    messageInput.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } });
    prevBtn.addEventListener('click', showPreviousSlide);
    nextBtn.addEventListener('click', showNextSlide);
    exportBtn.addEventListener('click', handleExport);
    
    textFormatControls.forEach(control => {
        control.addEventListener('mousedown', (e) => e.preventDefault());
        control.addEventListener('change', handleFormatChange);
        control.addEventListener('click', handleFormatChange);
    });
    btnDelete.addEventListener('mousedown', (e) => e.preventDefault());
    btnDelete.addEventListener('click', deleteSelectedElement);

    toolbarTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            toolbarTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            document.querySelectorAll('.toolbar').forEach(tb => tb.classList.remove('active'));
            document.getElementById(tab.dataset.tab).classList.add('active');
        });
    });

    // Insert Tab Event Listeners
    btnInsertTextbox.addEventListener('click', handleInsertTextbox);
    btnInsertImageLocal.addEventListener('click', () => imageUploadInput.click());
    imageUploadInput.addEventListener('change', handleImageUpload);
    shapeDropdownOptions.forEach(option => option.addEventListener('click', (e) => { e.preventDefault(); handleInsertShape(e.currentTarget.dataset.shape); }));
    iconDropdownOptions.forEach(option => option.addEventListener('click', (e) => { e.preventDefault(); handleInsertIcon(e.currentTarget.dataset.icon); }));
    
    // Modal Triggers
    btnInsertImageSearch.addEventListener('click', () => imageSearchModal.style.display = 'flex');
    btnInsertChart.addEventListener('click', () => chartModal.style.display = 'flex');
    btnInsertTable.addEventListener('click', () => tableModal.style.display = 'flex');
    btnInsertVideo.addEventListener('click', () => videoModal.style.display = 'flex');

    // Modal Close/Action Logic
    modals.forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal || e.target.classList.contains('modal-close-btn') || e.target.classList.contains('modal-btn-secondary')) {
                modal.style.display = 'none';
            }
        });
    });

    document.getElementById('image-search-btn').addEventListener('click', handleImageSearch);
    document.getElementById('create-chart-btn').addEventListener('click', handleCreateChart);
    document.getElementById('create-table-btn').addEventListener('click', handleCreateTable);
    document.getElementById('create-video-btn').addEventListener('click', handleCreateVideo);

    // Panel Collapse Logic
    document.querySelectorAll('.panel-toggle-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const panel = e.currentTarget.closest('.panel-container');
            panel.classList.toggle('collapsed');
            const icon = btn.querySelector('i');
            icon.classList.toggle('fa-chevron-down');
            icon.classList.toggle('fa-chevron-up');
        });
    });

    // Mobile Panel Toggle Logic
    document.querySelectorAll('.mobile-control-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const panelId = btn.dataset.panel;
            const panel = document.getElementById(panelId);
            panel.classList.toggle('is-open');
        });
    });

    window.addEventListener('message', (event) => {
        const { type, payload } = event.data;
        if (type === 'selection_change') {
            selectedElementInfo = { id: payload.elementId, type: payload.elementType };
            updateToolbarState();
        } else if (type === 'element_update') {
            if (!payload.elementId || !payload.newProps) return;
            updateFinalSlidesDOM(payload.elementId, payload.newProps, payload.property);
        } else if (type === 'SAVE_SLIDE_STATE') {
            saveCurrentSlideEdits();
            renderLayersPanel(); // Re-render layers panel after visibility change or deletion
        } else if (type === 'EDITOR_READY') {
            renderLayersPanel();
            broadcastInteractionLock();
        } else if (type === 'FORMATTING_STATE_UPDATE') {
            updateToolbarFormatting(payload);
        }
    });
    
    function updateFinalSlidesDOM(elementId, newProps, property = 'style') {
        let currentHtml = finalSlides[currentSlideIndex];
        if (!currentHtml) return;
        const parser = new DOMParser();
        const doc = parser.parseFromString(currentHtml, 'text/html');
        const elementToUpdate = doc.getElementById(elementId);
        if (elementToUpdate) {
            if (property === 'style') { 
                elementToUpdate.setAttribute('style', newProps.style); 
            } else if (property === 'content') { 
                elementToUpdate.innerHTML = newProps.content; 
            }
            finalSlides[currentSlideIndex] = doc.documentElement.outerHTML;
        }
    }

    function handleFormatChange(e) {
        const target = e.currentTarget;
        let command, value;
        if (target.id.startsWith('btn-align-')) { command = target.id.replace('btn-align-', 'justify'); } 
        else if (target.id.startsWith('btn-')) { command = target.id.replace('btn-', ''); } 
        else if (target.id === 'select-font-family') { command = 'fontName'; value = target.value; } 
        else if (target.id === 'select-font-size') { command = 'fontSize'; const sizeMap = {'12': 2, '16': 3, '20': 4, '24': 5, '32': 6, '48': 7, '64': 7}; value = sizeMap[target.value] || 3; } 
        else if (target.id === 'input-color') { command = 'foreColor'; value = target.value; }
        if (command) { formatText(command, value); }
    }

    function formatText(command, value = null) {
        if (selectedElementInfo.type === 'textbox' && slideIframe.contentWindow) {
            slideIframe.contentWindow.postMessage({ type: 'FORMAT_TEXT', payload: { command, value } }, '*');
        }
    }

    function deleteSelectedElement() {
        if (selectedElementInfo.id) {
            if (slideIframe.contentWindow) {
                slideIframe.contentWindow.postMessage({ type: 'DELETE_ELEMENT' }, '*');
            }
        }
    }

    function updateToolbarState() {
        const isTextboxSelected = selectedElementInfo.type === 'textbox';
        const isAnyElementSelected = !!selectedElementInfo.id;
        textFormatControls.forEach(control => control.disabled = !isTextboxSelected);
        btnDelete.disabled = !isAnyElementSelected;
        if (!isTextboxSelected) {
            btnBold.classList.remove('active');
            btnItalic.classList.remove('active');
            btnUnderline.classList.remove('active');
            btnAlignLeft.classList.remove('active');
            btnAlignCenter.classList.remove('active');
            btnAlignRight.classList.remove('active');
            btnAlignJustify.classList.remove('active');
        }
    }

    function rgbToHex(rgb) {
        if (!rgb || !rgb.includes('rgb')) return '#ffffff';
        const [r, g, b] = rgb.match(/\d+/g).map(Number);
        return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
    }

    function updateToolbarFormatting(state) {
        btnBold.classList.toggle('active', state.bold);
        btnItalic.classList.toggle('active', state.italic);
        btnUnderline.classList.toggle('active', state.underline);
        btnAlignLeft.classList.toggle('active', state.justifyLeft);
        btnAlignCenter.classList.toggle('active', state.justifyCenter);
        btnAlignRight.classList.toggle('active', state.justifyRight);
        btnAlignJustify.classList.toggle('active', state.justifyFull);
        fontFamilySelect.value = state.fontName || 'Arial';
        colorInput.value = rgbToHex(state.foreColor);
    }

    async function handleSendMessage() {
        const message = messageInput.value.trim();
        if (!message) return;
        addMessageToLog('user', message);
        conversationHistory.push({ role: 'user', content: message });
        messageInput.value = '';
        sendBtn.disabled = true;
        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ conversation_id: conversationId, history: conversationHistory })
            });
            if (!response.ok) { throw new Error(`Server error: ${response.statusText}`); }
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                let boundary;
                while ((boundary = buffer.indexOf('\n\n')) !== -1) {
                    const dataStr = buffer.substring(0, boundary).trim();
                    buffer = buffer.substring(boundary + 2);
                    if (dataStr.startsWith('data: ')) {
                        try {
                            const json = JSON.parse(dataStr.substring(6));
                            await processStreamEvent(json);
                        } catch (e) { console.warn("Error parsing stream data:", e); }
                    }
                }
            }
        } catch (error) {
            console.error("Failed to send message:", error);
            addMessageToLog('agent', "Sorry, I encountered an error. Please try again.");
        } finally {
            sendBtn.disabled = false;
        }
    }
    
    function addMessageToLog(sender, text) {
        const messageEl = document.createElement('div');
        messageEl.classList.add('chat-message', `${sender}-message`);
        messageEl.textContent = text;
        chatLog.appendChild(messageEl);
        chatLog.scrollTop = chatLog.scrollHeight;
    }

    async function processStreamEvent(event) {
        const data = event.data;
        if (event.type === 'status_update') {
            addMessageToLog('agent', data.message);
            conversationHistory.push({ role: 'agent', content: data.message });
        } else if (event.type === 'new_slide' || event.type === 'slide_update') {
            const slideIndex = data.slide_number - 1;
            finalSlides[slideIndex] = data.html;
            currentSlideIndex = slideIndex;
            renderCurrentSlide();
            renderSlideSorter();
        }
    }

    function renderCurrentSlide() {
        lockedElementId = null;
        if (finalSlides.length === 0 || !finalSlides[currentSlideIndex]) {
            layersList.innerHTML = ''; 
            return;
        };
        
        let html = finalSlides[currentSlideIndex];
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const head = doc.head;

        // Dynamic CDN Injection
        if (html.includes('class="fa') && !head.querySelector('link[href*="font-awesome"]')) {
            const faLink = doc.createElement('link');
            faLink.rel = 'stylesheet';
            faLink.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css';
            head.appendChild(faLink);
        }
        if (html.includes('<canvas') && !head.querySelector('script[src*="chart.js"]')) {
            const chartJsScript = doc.createElement('script');
            chartJsScript.src = 'https://cdn.jsdelivr.net/npm/chart.js';
            head.appendChild(chartJsScript);
        }

        slideIframe.srcdoc = doc.documentElement.outerHTML;
        slideIframe.onload = () => {
            if (slideIframe.contentWindow && slideIframe.contentDocument) {
                const doc = slideIframe.contentDocument;
                doc.documentElement.style.height = '100%';
                doc.body.style.height = '100%';
                doc.body.style.margin = '0';
                const editorScript = doc.createElement('script');
                editorScript.src = `/static/editor.js?v=${Date.now()}`; 
                doc.body.appendChild(editorScript);
            }
        };
        updateNavControls();
        updateToolbarState();
        scaleCanvas();
    }

    function renderSlideSorter() {
        slideSorterBody.innerHTML = '';
        finalSlides.forEach((html, index) => {
            if (!html) return;
            const thumb = document.createElement('div');
            thumb.className = 'slide-thumbnail';
            thumb.draggable = true;
            thumb.dataset.index = index;
            if (index === currentSlideIndex) { thumb.classList.add('selected'); }
            const thumbIframe = document.createElement('iframe');
            thumbIframe.className = 'thumbnail-iframe';
            thumbIframe.srcdoc = html;
            const overlay = document.createElement('div');
            overlay.className = 'thumbnail-overlay';
            overlay.textContent = index + 1;
            thumb.appendChild(thumbIframe);
            thumb.appendChild(overlay);
            thumb.addEventListener('click', () => {
                saveCurrentSlideEdits();
                currentSlideIndex = index;
                renderCurrentSlide();
                renderSlideSorter();
            });
            slideSorterBody.appendChild(thumb);
        });
        addSlideSorterDragDrop();
    }

    function updateNavControls() {
        const total = finalSlides.length;
        slideCounter.textContent = `Slide ${total > 0 ? currentSlideIndex + 1 : 0} / ${total}`;
        prevBtn.disabled = currentSlideIndex === 0;
        nextBtn.disabled = currentSlideIndex >= total - 1;
    }

    function saveCurrentSlideEdits() {
        if (slideIframe.contentDocument && finalSlides[currentSlideIndex]) {
            const editedHtml = slideIframe.contentDocument.documentElement.outerHTML;
            finalSlides[currentSlideIndex] = editedHtml;
        }
    }

    function showPreviousSlide() {
        if (currentSlideIndex > 0) {
            saveCurrentSlideEdits();
            currentSlideIndex--;
            renderCurrentSlide();
            renderSlideSorter();
        }
    }

    function showNextSlide() {
        if (currentSlideIndex < finalSlides.length - 1) {
            saveCurrentSlideEdits();
            currentSlideIndex++;
            renderCurrentSlide();
            renderSlideSorter();
        }
    }

    function renderLayersPanel() {
        layersList.innerHTML = '';
        const doc = slideIframe.contentDocument;
        if (!doc) return;
        const layeredElements = Array.from(doc.querySelectorAll('[data-layer]'));
        layeredElements.sort((a, b) => (parseInt(b.getAttribute('data-layer')) || 0) - (parseInt(a.getAttribute('data-layer')) || 0));
        
        layeredElements.forEach(el => {
            const layerItem = document.createElement('div');
            layerItem.className = 'layer-item';
            layerItem.draggable = true;
            layerItem.dataset.elementId = el.id;
            const type = el.getAttribute('data-element-type') || 'element';
            const isVisible = el.style.display !== 'none';
            const iconClass = type === 'textbox' ? 'fa-t' : type === 'image' ? 'fa-image' : type === 'shape' ? 'fa-shapes' : type === 'chart' ? 'fa-chart-pie' : type === 'table' ? 'fa-table' : type === 'video' ? 'fa-video' : 'fa-star';
            const lockIconClass = (lockedElementId === el.id) ? 'fa-lock' : 'fa-lock-open';
            
            layerItem.innerHTML = `
                <i class="fa ${iconClass}"></i> 
                <span>${type.charAt(0).toUpperCase() + type.slice(1)}</span> 
                <div class="layer-item-controls">
                    <i class="fa ${isVisible ? 'fa-eye' : 'fa-eye-slash'} layer-control-btn visibility-toggle" title="Show/Hide"></i>
                    <i class="fa ${lockIconClass} layer-control-btn lock-toggle" title="Lock/Unlock"></i>
                    <i class="fa fa-trash-can layer-control-btn delete-layer" title="Delete"></i>
                </div>
            `;
            if (lockedElementId === el.id) layerItem.classList.add('locked');
            layersList.appendChild(layerItem);
        });
        addLayerPanelHandlers();
    }

    function addLayerPanelHandlers() {
        layersList.querySelectorAll('.layer-item').forEach(item => {
            item.addEventListener('dragstart', handleLayerDragStart);
            item.addEventListener('dragend', handleLayerDragEnd);
            item.querySelector('.lock-toggle').addEventListener('click', toggleLayerLock);
            item.querySelector('.visibility-toggle').addEventListener('click', toggleLayerVisibility);
            item.querySelector('.delete-layer').addEventListener('click', (e) => {
                e.stopPropagation();
                if (slideIframe.contentWindow) {
                    slideIframe.contentWindow.postMessage({ type: 'DELETE_ELEMENT', payload: { elementId: item.dataset.elementId } }, '*');
                }
            });
        });
        layersList.addEventListener('dragover', handleLayerDragOver);
    }

    function toggleLayerLock(e) {
        e.stopPropagation();
        const layerItem = e.currentTarget.closest('.layer-item');
        const elementId = layerItem.dataset.elementId;
        lockedElementId = (lockedElementId === elementId) ? null : elementId;
        broadcastInteractionLock();
        renderLayersPanel();
    }

    function toggleLayerVisibility(e) {
        e.stopPropagation();
        const elementId = e.currentTarget.closest('.layer-item').dataset.elementId;
        if (slideIframe.contentWindow) {
            slideIframe.contentWindow.postMessage({ type: 'TOGGLE_VISIBILITY', payload: { elementId } }, '*');
        }
    }

    function broadcastInteractionLock() {
        if (slideIframe.contentWindow) {
            slideIframe.contentWindow.postMessage({ type: 'SET_INTERACTION_LOCK', payload: { elementId: lockedElementId } }, '*');
        }
    }

    let draggingLayerItem = null;
    function handleLayerDragStart(e) {
        draggingLayerItem = e.currentTarget;
        setTimeout(() => draggingLayerItem.classList.add('dragging'), 0);
    }
    function handleLayerDragEnd() {
        if (draggingLayerItem) {
            draggingLayerItem.classList.remove('dragging');
            draggingLayerItem = null;
            updateLayersFromPanel();
        }
    }
    function handleLayerDragOver(e) {
        e.preventDefault();
        const afterElement = getDragAfterElement(layersList, e.clientY);
        if (draggingLayerItem) {
            if (afterElement == null) {
                layersList.appendChild(draggingLayerItem);
            } else {
                layersList.insertBefore(draggingLayerItem, afterElement);
            }
        }
    }

    function getDragAfterElement(container, y) {
        const draggableElements = [...container.querySelectorAll('.layer-item:not(.dragging)')];
        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;
            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }

    function updateLayersFromPanel() {
        const layerItems = layersList.querySelectorAll('.layer-item');
        const totalLayers = layerItems.length;
        const commands = [];
        layerItems.forEach((item, index) => {
            const elementId = item.dataset.elementId;
            const newLayerIndex = totalLayers - 1 - index;
            commands.push({ elementId, newLayerIndex });
        });
        if (slideIframe.contentWindow) {
            slideIframe.contentWindow.postMessage({ type: 'REORDER_LAYERS', payload: commands }, '*');
        }
    }

    // Slide Sorter Drag & Drop
    let draggingSlideIndex = null;
    function addSlideSorterDragDrop() {
        const thumbnails = slideSorterBody.querySelectorAll('.slide-thumbnail');
        thumbnails.forEach(thumb => {
            thumb.addEventListener('dragstart', (e) => {
                draggingSlideIndex = parseInt(e.currentTarget.dataset.index, 10);
                e.currentTarget.classList.add('dragging');
            });
            thumb.addEventListener('dragend', (e) => {
                e.currentTarget.classList.remove('dragging');
                draggingSlideIndex = null;
            });
            thumb.addEventListener('dragover', (e) => {
                e.preventDefault();
            });
            thumb.addEventListener('drop', (e) => {
                e.preventDefault();
                if (draggingSlideIndex === null) return;
                const droppedOnIndex = parseInt(e.currentTarget.dataset.index, 10);
                if (draggingSlideIndex !== droppedOnIndex) {
                    const draggedSlide = finalSlides.splice(draggingSlideIndex, 1)[0];
                    finalSlides.splice(droppedOnIndex, 0, draggedSlide);
                    
                    if (currentSlideIndex === draggingSlideIndex) {
                        currentSlideIndex = droppedOnIndex;
                    } else if (draggingSlideIndex < currentSlideIndex && droppedOnIndex >= currentSlideIndex) {
                        currentSlideIndex--;
                    } else if (draggingSlideIndex > currentSlideIndex && droppedOnIndex <= currentSlideIndex) {
                        currentSlideIndex++;
                    }
                    
                    renderSlideSorter();
                    renderCurrentSlide();
                }
            });
        });
    }

    // --- Core Insert Logic ---
    function getHighestLayer(doc) {
        if (!doc) return -1;
        const layers = Array.from(doc.querySelectorAll('[data-layer]'));
        if (layers.length === 0) return -1;
        return Math.max(...layers.map(el => parseInt(el.getAttribute('data-layer'), 10) || 0));
    }

    function insertElement(htmlToInsert) {
        if (finalSlides.length === 0 || currentSlideIndex < 0) {
            alert("Please create or select a slide first.");
            return;
        }
        let currentHtml = finalSlides[currentSlideIndex];
        const parser = new DOMParser();
        const doc = parser.parseFromString(currentHtml, 'text/html');
        const body = doc.body;
        if (body) {
            const tempDiv = doc.createElement('div');
            tempDiv.innerHTML = htmlToInsert.trim();
            const newElement = tempDiv.firstChild;
            if (newElement) {
                body.appendChild(newElement);
            }
        }
        finalSlides[currentSlideIndex] = doc.documentElement.outerHTML;
        renderCurrentSlide();
    }

    function handleInsertTextbox() {
        const parser = new DOMParser();
        const doc = parser.parseFromString(finalSlides[currentSlideIndex] || '<html><body></body></html>', 'text/html');
        const newLayerIndex = getHighestLayer(doc) + 1;
        const elementId = `el_${Date.now()}`;
        const textboxHtml = `
            <div id="${elementId}" data-layer="${newLayerIndex}" data-element-type="textbox" contentEditable="true"
                 style="position: absolute; top: 20%; left: 20%; width: 60%; min-height: 50px; padding: 10px; border: 1px solid transparent; font-size: 24px; color: #FFFFFF; z-index: ${newLayerIndex};">
                New Textbox
            </div>
        `;
        insertElement(textboxHtml);
    }

    function handleImageUpload(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function(event) {
            insertImage(event.target.result);
        };
        reader.readAsDataURL(file);
        e.target.value = '';
    }

    function insertImage(src) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(finalSlides[currentSlideIndex] || '<html><body></body></html>', 'text/html');
        const newLayerIndex = getHighestLayer(doc) + 1;
        const elementId = `el_${Date.now()}`;
        const imageHtml = `
            <div id="${elementId}" data-layer="${newLayerIndex}" data-element-type="image"
                 style="position: absolute; top: 25%; left: 25%; width: 50%; height: 50%; z-index: ${newLayerIndex};">
                <img src="${src}" style="width: 100%; height: 100%; object-fit: cover;">
            </div>
        `;
        insertElement(imageHtml);
    }

    function handleInsertShape(shapeType) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(finalSlides[currentSlideIndex] || '<html><body></body></html>', 'text/html');
        const newLayerIndex = getHighestLayer(doc) + 1;
        const elementId = `el_${Date.now()}`;
        let shapeStyle = `position: absolute; top: 30%; left: 30%; width: 200px; height: 150px; background-color: var(--accent-color, #6A5ACD); z-index: ${newLayerIndex};`;
        if (shapeType === 'circle') {
            shapeStyle += ' border-radius: 50%; width: 150px; height: 150px;';
        }
        const shapeHtml = `
            <div id="${elementId}" data-layer="${newLayerIndex}" data-element-type="shape" style="${shapeStyle}"></div>
        `;
        insertElement(shapeHtml);
    }

    function handleInsertIcon(iconClass) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(finalSlides[currentSlideIndex] || '<html><body></body></html>', 'text/html');
        const newLayerIndex = getHighestLayer(doc) + 1;
        const elementId = `el_${Date.now()}`;
        const iconHtml = `
            <div id="${elementId}" data-layer="${newLayerIndex}" data-element-type="icon"
                 style="position: absolute; top: 40%; left: 40%; font-size: 96px; color: #FFFFFF; z-index: ${newLayerIndex};">
                <i class="${iconClass}"></i>
            </div>
        `;
        insertElement(iconHtml);
    }

    async function handleImageSearch() {
        const query = document.getElementById('image-search-input').value.trim();
        if (!query) return;
        const resultsContainer = document.getElementById('image-search-results');
        resultsContainer.innerHTML = `<div class="spinner"><i class="fa fa-spinner fa-spin"></i></div>`;
        try {
            const response = await fetch('/api/tools/search_images', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query, conversation_id: conversationId })
            });
            const data = await response.json();
            if (!response.ok || !data.image_urls || data.image_urls.length === 0) {
                resultsContainer.innerHTML = 'No results found.';
                return;
            }
            resultsContainer.innerHTML = '';
            data.image_urls.forEach(url => {
                const img = document.createElement('img');
                img.src = url;
                img.addEventListener('click', () => {
                    insertImage(url);
                    imageSearchModal.style.display = 'none';
                });
                resultsContainer.appendChild(img);
            });
        } catch (e) {
            resultsContainer.innerHTML = 'Search failed.';
        }
    }

    async function handleCreateChart() {
        const dataQuery = document.getElementById('chart-data-query').value;
        const chartType = document.getElementById('chart-type-select').value;
        const createBtn = document.getElementById('create-chart-btn');
        createBtn.disabled = true;
        createBtn.innerHTML = '<i class="fa fa-spinner fa-spin"></i>';
        try {
            const response = await fetch('/api/tools/create_chart', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ data_query: dataQuery, chart_type: chartType, conversation_id: conversationId })
            });
            const data = await response.json();
            if (!response.ok || data.error) throw new Error(data.error || 'Failed to get chart data.');
            
            const parser = new DOMParser();
            const doc = parser.parseFromString(finalSlides[currentSlideIndex] || '<html><body></body></html>', 'text/html');
            const newLayerIndex = getHighestLayer(doc) + 1;
            const elementId = `el_${Date.now()}`;
            const chartHtml = `
                <div id="${elementId}" data-layer="${newLayerIndex}" data-element-type="chart"
                     style="position: absolute; top: 15%; left: 15%; width: 70%; height: 70%; z-index: ${newLayerIndex};">
                    <canvas id="chart-${elementId}"></canvas>
                    <script>
                        new Chart(document.getElementById('chart-${elementId}'), {
                            type: '${chartType}',
                            data: ${JSON.stringify(data)},
                            options: { responsive: true, maintainAspectRatio: false }
                        });
                    <\/script>
                </div>
            `;
            insertElement(chartHtml);
            chartModal.style.display = 'none';
        } catch (e) {
            alert(`Chart creation failed: ${e.message}`);
        } finally {
            createBtn.disabled = false;
            createBtn.textContent = 'Create Chart';
        }
    }
    
    function handleCreateTable() {
        const cols = parseInt(document.getElementById('table-cols-input').value, 10);
        const rows = parseInt(document.getElementById('table-rows-input').value, 10);
        if (isNaN(cols) || isNaN(rows) || cols < 1 || rows < 1) return;

        let tableHTML = '<thead><tr>';
        for (let c = 0; c < cols; c++) tableHTML += `<th>Header ${c + 1}</th>`;
        tableHTML += '</tr></thead><tbody>';
        for (let r = 0; r < rows; r++) {
            tableHTML += '<tr>';
            for (let c = 0; c < cols; c++) tableHTML += `<td>Cell</td>`;
            tableHTML += '</tr>';
        }
        tableHTML += '</tbody>';

        const parser = new DOMParser();
        const doc = parser.parseFromString(finalSlides[currentSlideIndex] || '<html><body></body></html>', 'text/html');
        const newLayerIndex = getHighestLayer(doc) + 1;
        const elementId = `el_${Date.now()}`;
        const tableWrapperHtml = `
            <div id="${elementId}" data-layer="${newLayerIndex}" data-element-type="table" contentEditable="true"
                 style="position: absolute; top: 20%; left: 10%; width: 80%; z-index: ${newLayerIndex}; color: #fff;">
                <style>
                    table { width: 100%; border-collapse: collapse; }
                    th, td { border: 1px solid #666; padding: 8px; text-align: left; }
                    th { background-color: #3a3a3c; }
                </style>
                <table>${tableHTML}</table>
            </div>
        `;
        insertElement(tableWrapperHtml);
        tableModal.style.display = 'none';
    }

    function handleCreateVideo() {
        const url = document.getElementById('video-url-input').value;
        let videoId = null;
        const youtubeRegex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
        const match = url.match(youtubeRegex);
        if (match && match[1]) videoId = match[1];
        
        if (!videoId) {
            alert("Invalid YouTube URL");
            return;
        }

        const parser = new DOMParser();
        const doc = parser.parseFromString(finalSlides[currentSlideIndex] || '<html><body></body></html>', 'text/html');
        const newLayerIndex = getHighestLayer(doc) + 1;
        const elementId = `el_${Date.now()}`;
        const videoHtml = `
            <div id="${elementId}" data-layer="${newLayerIndex}" data-element-type="video"
                 style="position: absolute; top: 20%; left: 20%; width: 60%; height: auto; aspect-ratio: 16/9; z-index: ${newLayerIndex};">
                <iframe src="https://www.youtube.com/embed/${videoId}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen
                        style="width: 100%; height: 100%;"></iframe>
            </div>
        `;
        insertElement(videoHtml);
        videoModal.style.display = 'none';
    }
    
    async function handleExport() {
        if (finalSlides.length === 0) {
            alert("Please generate a presentation before exporting.");
            return;
        }
        exportBtn.disabled = true;
        exportBtn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Exporting...';
        try {
            saveCurrentSlideEdits();
            const response = await fetch('/api/export', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    conversation_id: conversationId,
                    slides_html: finalSlides
                })
            });
            if (!response.ok) { throw new Error((await response.json()).error || 'Export failed'); }
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = 'presentation.pptx';
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            a.remove();
        } catch (e) {
            console.error("Export error:", e);
            alert(`Failed to export presentation: ${e.message}`);
        } finally {
            exportBtn.disabled = false;
            exportBtn.innerHTML = '<i class="fa fa-file-powerpoint"></i> Export PPTX';
        }
    }
    
    function scaleCanvas() {
        const scale = canvasWrapper.clientWidth / 1280;
        slideIframeContainer.style.transform = `scale(${scale})`;
    }

    window.addEventListener('resize', scaleCanvas);
    
    updateToolbarState();
    scaleCanvas();
});