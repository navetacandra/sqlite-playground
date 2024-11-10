<script>
  import { onMount, onDestroy } from 'svelte';
  import { writable } from 'svelte/store';
  import { initializeSQLite3 } from './sql';

  let db;
  let contextmenuOpen = false;
  let ready = false;
  let focus = false;
  let history = [];
  let cursor = 0;
  let outputs = writable([]);
  let queryInput;
  let customContextmenu;
  let query = '';
  let caretPos = 0;
  let selectionStart = 0;
  let selectionEnd = 0;

  const addOutput = (message, isError = false) => {
    const formattedMessage = `<span ${isError ? 'style="color: red"' : ''}>${message.replace(/\n/g, '<br>')}</span>`;
    outputs.update(prev => [...prev, formattedMessage]);
  };

  const formatQueryOutput = (query) => `<span><b>sqlite&gt;</b>&nbsp;${query.split('\n').join('<br/>')}</span>`;

  const calculateColumnWidths = (keys, values) => keys.map((key, index) => {
    const keyWidth = key.length;
    const valueWidth = Math.max(...values.map(row => (row[index] === null ? 'NULL' : row[index].toString()).length));
    return Math.max(keyWidth, valueWidth);
  });

  const formatTable = (keys, values, columnWidths) => {
    const formatRow = row => row.map((cell, i) => (cell === null ? 'NULL' : cell.toString()).padEnd(columnWidths[i], ' ')).join('|');
    const separator = columnWidths.map(width => '-'.repeat(width)).join('+');
    return [formatRow(keys), separator, ...values.map(formatRow)].join('\n');
  };

  const executeQuery = (query) => {
    if (/^\\! clear;?/.test(query.trim())) {
      outputs.set([]);
      return;
    }

    if (/^\.tables;?/.test(query.trim())) {
      const tables = db.exec(`SELECT name FROM sqlite_schema WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%';`, { returnValue: 'resultRows', rowMode: 'array' }).map(row => row[0]);
      addOutput(tables.join('\n'));
      return;
    }

    const result = db.exec(query, { returnValue: 'resultRows', rowMode: 'object' });
    if (result && result.length) {
      const keys = Object.keys(result[0]);
      const values = result.map(row => keys.map(key => row[key]));
      const columnWidths = calculateColumnWidths(keys, values);
      const formattedTable = formatTable(keys, values, columnWidths);
      addOutput(formattedTable);
    }
  };

  const runQuery = (e) => {
    e.preventDefault();
    addOutput(formatQueryOutput(query.trim()));
    if (!query.trim()) return;

    history.push(query.trim());
    cursor = history.length;
    try {
      executeQuery(query.trim());
    } catch (err) {
      addOutput((err.message || err.toString()).replace(/^SQLITE_ERROR: sqlite3 result code \d+: /, ''), true);
    } finally {
      query = '';
    }
  };

  const interuptQuery = () => {
    addOutput(`<b style="color: red">sqlite&gt;</b>&nbsp;${query.trim()}`);
    query = '';
  };

  const handleHistoryNavigation = (e) => {
    updateCaretPosition();
    const keyCode = e.keyCode || e.which;
    if (keyCode === 67 && e.ctrlKey) {
      e.preventDefault();
      if (!e.shiftKey) {
        return interuptQuery();
      }
      document.execCommand('copy');
      return;
    }
    const direction = keyCode === 38 ? -1 : keyCode === 40 ? 1 : 0;
    if (!direction) return;

    e.preventDefault();
    cursor = Math.max(cursor + direction, 0);
    if (cursor < history.length) {
      query = history[cursor] || '';
      return;
    }
    cursor = history.length;
    query = '';
  };

  const updateCaretPosition = () => {
    selectionStart = queryInput.selectionStart;
    selectionEnd = queryInput.selectionEnd;
  };

  
  async function copy() {
    const selectedText = window.getSelection().toString() || query.substring(selectionStart, selectionEnd);
    contextmenuOpen = false;
   
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(selectedText)
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = selectedText;
      textarea.style.position = 'fixed';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
  }

  async function paste(withNavigator = true) {
    if (navigator.clipboard && navigator.clipboard.readText) {
      try {
        const text = await navigator.clipboard.readText();
        query += text;
      } catch (err) {
        console.error('Failed to paste text with Clipboard API:', err);
        paste(false);
      }
    } else {
      const fallbackText = prompt("Your browser doesn't support pasting. Please paste here:");
      if (fallbackText !== null) {
        query += fallbackText;
      }
    }
    contextmenuOpen = false;
  }

  function selectAll() {
    if(!queryInput) return;
    queryInput.selectionStart = 0;
    queryInput.selectionEnd = query.length;
    contextmenuOpen = false;
    updateCaretPosition();
  }

  function handleContextmenu(e) {
    e.preventDefault();
    e.stopPropagation();
    if(!customContextmenu) return;
    contextmenuOpen = true;
    customContextmenu.focus();
    customContextmenu.style.top = `${e.clientY + 20}px`;
    customContextmenu.style.left = `${e.clientX}px`;
  }

  onMount(async () => {
    addOutput('Getting <b>SQLite3</b> Ready...');
    try {
      db = await initializeSQLite3();
      addOutput('<b>SQLite3</b> Ready.\n\n');
      ready = true;
    } catch (err) {
      addOutput(err.message || err.toString(), true);
    } finally {
      if (queryInput) queryInput.focus();
      document.addEventListener('contextmenu', handleContextmenu);
    }
  });

  onDestroy(() => {
    document.removeEventListener('contextmenu', handleContextmenu);
  })
</script>

<div class="contextmenu" tabindex="-1" bind:this={customContextmenu} class:open={contextmenuOpen} on:blur={() => contextmenuOpen = false}>
  <ul class="contextmenu-items">
    <li on:mousedown={copy}>Copy</li>
    <li on:mousedown={paste}>Paste</li>
    <li on:mousedown={selectAll}>Select All</li>
  </ul>
</div>

<main>
  <label for="query-input" on:click={() => contextmenuOpen = false}>
    <ul class="output">
      {#each $outputs as output}
        <li>{@html (() => output)()}</li>
      {/each}
      {#if ready}
      <span class="qinput">
        <b>sqlite&gt;&nbsp;</b>
        <span class="text">
          {query.slice(0, selectionStart)}<span class="selected">{query.slice(selectionStart, selectionEnd)}</span><span class={`cursor${focus ? '' : ' hidden'}`}></span>{query.slice(selectionEnd)}
        </span>
      </span>
      <form on:submit={runQuery}>
        <input type="text" id="query-input" bind:value={query} bind:this={queryInput}
          on:keydown={handleHistoryNavigation}
          on:input={updateCaretPosition}
          on:click={updateCaretPosition}
          on:keyup={updateCaretPosition}
          on:focus={() => focus = true}
          on:blur={() => focus = false} />
      </form>
      {/if}
    </ul>
  </label>
</main>

<style>
.contextmenu {
  display: none;
  position: absolute;
  top: 0;
  left: 0;
  z-index: 999;
  background: #fff !important;
  padding: .15 .5rem;
  overflow: hidden;
  min-width: 10rem;
  border: 1px solid #ccc;
  border-radius: .25rem;
}

.contextmenu.open {
  display: block;
}

.contextmenu-items {
  list-style: none;
  padding: 0;
  margin: 0;
}

.contextmenu-items li {
  background: #fff;
  padding: .5rem;
  cursor: pointer;
  transition: background .15s;
}

.contextmenu-items li:hover {
  background: #ccc !important;
}

label:has(.output) {
  min-height: 100dvh;
  min-width: 100vw;
}

.qinput {
  padding: .15rem;
  display: inline;
  position: relative;
  word-break: break-all;
  font-size: 0;
}

.qinput * {
  font-size: .95rem;
}

.text {
  display: inline;
}

.cursor {
  display: inline-block;
  width: .25rem;
  height: 1em;
  background: #fff;
  position: relative;
  top: .2rem;
  animation: blink 1s infinite steps(1, start);  
}

.hidden {
  display: none;
  visibility: hidden;
}

.selected {
  background: #ffffffdc;
  color: #000;
}

@keyframes blink {
  0%, 50% {
    opacity: 1;
  }
  51%, 100% {
    opacity: 0;
  }
}

.output {
  font-family: monospace;
  width: 100%;
  height: 100dvh;
  background: #000;
  color: #fff;
  list-style: none;
  padding: .5rem;
  overflow: auto;
  font-size: .95rem;
}

.output li {
  white-space: pre-wrap;
  word-break: break-all;
  padding: .15rem;
  font-size: .95rem;
}

.output form {
  position: fixed;
  top: 0;
  left: 0;
  transform: translateY(-200%);
}
</style>

