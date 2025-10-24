document.addEventListener('DOMContentLoaded', () => {
    const width = window.innerWidth;
    const height = window.innerHeight - 60;

    const graph = d3.select('#graph');
    const blockInfo = document.getElementById('current-block');
    const prevButton = document.getElementById('prev-block');
    const nextButton = document.getElementById('next-block');
    const searchButton = document.getElementById('search-btn');
    const searchInput = document.getElementById('block-search');
    const rangeStartInput = document.getElementById('range-start');
    const rangeEndInput = document.getElementById('range-end');
    const rangeButton = document.getElementById('range-fetch-btn');
    const apiBase = (window.location.origin && window.location.origin !== 'null')
        ? window.location.origin
        : 'http://127.0.0.1:8000';

    if (
        !blockInfo ||
        !prevButton ||
        !nextButton ||
        !searchButton ||
        !searchInput ||
        !rangeStartInput ||
        !rangeEndInput ||
        !rangeButton
    ) {
        console.error('Initialization failed: required UI elements are missing.');
        return;
    }

    let blockNumber = parseInt(localStorage.getItem('currentBlockNumber'), 10);
    if (Number.isNaN(blockNumber)) {
        blockNumber = 22845771;
        localStorage.setItem('currentBlockNumber', String(blockNumber));
    }

    prefillRangeInputs(blockNumber, blockNumber + 1);

    function storeBlockNumber(value) {
        const parsed = Number(value);
        if (Number.isNaN(parsed)) {
            return false;
        }
        blockNumber = parsed;
        localStorage.setItem('currentBlockNumber', String(blockNumber));
        return true;
    }

    function prefillRangeInputs(startValue, endValue) {
        if (rangeStartInput && !rangeStartInput.value) {
            rangeStartInput.value = String(startValue);
        }
        if (rangeEndInput && !rangeEndInput.value) {
            rangeEndInput.value = String(endValue);
        }
    }

    function setSingleLabel() {
        blockInfo.textContent = `Block Number: ${blockNumber}`;
    }

    function setRangeLabel(start, end) {
        blockInfo.textContent = `Block Range: ${start} - ${end}`;
    }

    function renderMessage(text, color = '#666', fontSize = '18px') {
        graph.selectAll('*').remove();
        graph.attr('width', width).attr('height', height);
        d3.selectAll('.tooltip').remove();

        graph.append('text')
            .attr('x', width / 2)
            .attr('y', height / 2)
            .attr('text-anchor', 'middle')
            .style('font-size', fontSize)
            .style('fill', color)
            .text(text);
    }

    function renderGraph(linksPayload) {
        graph.attr('width', width).attr('height', height);
        d3.selectAll('.tooltip').remove();

        const parsedLinks = Array.isArray(linksPayload)
            ? linksPayload
            : (typeof linksPayload === 'string' ? JSON.parse(linksPayload) : []);

        if (!Array.isArray(parsedLinks) || parsedLinks.length === 0) {
            renderMessage('No transactions found for selection.', '#888');
            return;
        }

        const nodesMap = new Map();
        const links = [];

        parsedLinks.forEach(transaction => {
            Object.entries(transaction).forEach(([from, to]) => {
                if (!nodesMap.has(from)) {
                    nodesMap.set(from, { id: from, group: 'from' });
                }
                if (!nodesMap.has(to)) {
                    nodesMap.set(to, { id: to, group: 'to' });
                }
                links.push({ source: from, target: to });
            });
        });

        const nodes = Array.from(nodesMap.values());
        if (nodes.length === 0) {
            renderMessage('No transaction nodes to display.', '#888');
            return;
        }

        graph.selectAll('*').remove();

        const root = graph.append('g');

        graph.on('.zoom', null);
        const zoomBehaviour = d3.zoom()
            .scaleExtent([0.1, 10])
            .on('zoom', event => {
                root.attr('transform', event.transform);
            });
        graph.call(zoomBehaviour);

        const color = d3.scaleOrdinal()
            .domain(['from', 'to'])
            .range(['blue', 'green']);

        const linkSelection = root.append('g')
            .selectAll('line')
            .data(links)
            .enter()
            .append('line')
            .attr('stroke', '#999')
            .attr('stroke-opacity', 0.6)
            .attr('stroke-width', 1);

        const nodeSelection = root.append('g')
            .selectAll('circle')
            .data(nodes)
            .enter()
            .append('circle')
            .attr('r', 6)
            .attr('fill', d => color(d.group))
            .attr('stroke-width', 1.5);

        const tooltip = d3.select('body')
            .append('div')
            .attr('class', 'tooltip')
            .style('opacity', 0);

        nodeSelection
            .on('mouseover', (event, d) => {
                tooltip.transition()
                    .duration(200)
                    .style('display', 'block')
                    .style('opacity', 1)
                    .style('background-color', '#555')
                    .style('color', '#fff')
                    .style('border-radius', '6px')
                    .style('padding', '4px 3px')
                    .style('width', '450px')
                    .style('text-align', 'center');

                tooltip.html(`Address: ${d.id}`)
                    .style('left', `${event.pageX + 10}px`)
                    .style('top', `${event.pageY - 28}px`);
            })
            .on('mouseout', () => {
                tooltip.transition()
                    .duration(500)
                    .style('opacity', 0)
                    .style('display', 'none');
            })
            .on('click', (_, d) => {
                alert(`Address: ${d.id}`);
            });

        const simulation = d3.forceSimulation(nodes)
            .force('link', d3.forceLink(links).id(d => d.id))
            .force('charge', d3.forceManyBody())
            .force('x', d3.forceX(width / 2).strength(0.1))
            .force('y', d3.forceY(height / 2).strength(0.1));

        const dragBehaviour = d3.drag()
            .on('start', (event, d) => {
                if (!event.active) simulation.alphaTarget(0.3).restart();
                d.fx = d.x;
                d.fy = d.y;
            })
            .on('drag', (event, d) => {
                d.fx = event.x;
                d.fy = event.y;
            })
            .on('end', (event, d) => {
                if (!event.active) simulation.alphaTarget(0);
                d.fx = null;
                d.fy = null;
            });

        nodeSelection.call(dragBehaviour);

        simulation.on('tick', () => {
            linkSelection
                .attr('x1', d => d.source.x)
                .attr('y1', d => d.source.y)
                .attr('x2', d => d.target.x)
                .attr('y2', d => d.target.y);

            nodeSelection
                .attr('cx', d => d.x)
                .attr('cy', d => d.y);
        });
    }

    function requestJSON(url, options = {}) {
        return fetch(url, options).then(async response => {
            let payload = null;
            try {
                payload = await response.json();
            } catch {
                payload = null;
            }

            if (!response.ok) {
                const message = payload && payload.detail
                    ? payload.detail
                    : `HTTP ${response.status}: ${response.statusText}`;
                throw new Error(message);
            }

            return payload;
        });
    }

    function handleError(context, error) {
        console.error(`Error fetching ${context}:`, error);
        renderMessage(`Error: ${error.message}`, '#ff6b6b', '16px');
        alert(`Error loading ${context}: ${error.message}`);
    }

    function fetchSingleBlock(value) {
        const parsed = Number(value);
        if (Number.isNaN(parsed) || parsed < 0) {
            alert('Block number must be a non-negative integer.');
            return;
        }

        storeBlockNumber(parsed);
        setSingleLabel();
        prefillRangeInputs(parsed, parsed + 1);
        renderMessage(`Loading block ${parsed}...`);
        console.debug(`Requesting single block ${parsed} from ${apiBase}/block/${parsed}`);

        requestJSON(`${apiBase}/block/${parsed}`)
            .then(data => {
                if (!data || data.status !== 'success' || typeof data.links === 'undefined') {
                    throw new Error('Unexpected response from server.');
                }
                renderGraph(data.links);
            })
            .catch(error => handleError(`block ${parsed}`, error));
    }

    function fetchRangeBlocks(start, end) {
        const startBlock = Number(start);
        const endBlock = Number(end);

        if (Number.isNaN(startBlock) || Number.isNaN(endBlock)) {
            alert('Both range fields must be valid block numbers.');
            return;
        }

        if (startBlock < 0 || endBlock < 0) {
            alert('Block range must be non-negative.');
            return;
        }

        if (startBlock > endBlock) {
            alert('From block must be less than or equal to To block.');
            return;
        }

        rangeStartInput.value = String(startBlock);
        rangeEndInput.value = String(endBlock);
        storeBlockNumber(startBlock);
        setRangeLabel(startBlock, endBlock);
        renderMessage(`Loading blocks ${startBlock} - ${endBlock}...`);
        console.debug(`Requesting block range ${startBlock}-${endBlock} from ${apiBase}/blocks`);

        requestJSON(`${apiBase}/blocks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ start_block: startBlock, end_block: endBlock })
        })
            .then(data => {
                if (!data || data.status !== 'success' || typeof data.links === 'undefined') {
                    throw new Error('Unexpected response from server.');
                }
                renderGraph(data.links);
            })
            .catch(error => handleError(`blocks ${startBlock}-${endBlock}`, error));
    }

    prevButton.addEventListener('click', () => {
        fetchSingleBlock(blockNumber - 1);
    });

    nextButton.addEventListener('click', () => {
        fetchSingleBlock(blockNumber + 1);
    });

    searchButton.addEventListener('click', () => {
        const inputValue = parseInt(searchInput.value, 10);
        if (Number.isNaN(inputValue)) {
            alert('Please enter a valid block number.');
            return;
        }
        fetchSingleBlock(inputValue);
    });

    rangeButton.addEventListener('click', event => {
        event.preventDefault();
        console.debug('Range button clicked', {
            start: rangeStartInput.value,
            end: rangeEndInput.value
        });
        fetchRangeBlocks(rangeStartInput.value, rangeEndInput.value);
    });

    fetchSingleBlock(blockNumber);
});