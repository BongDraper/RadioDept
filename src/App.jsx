import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { STATIONS } from './stations.js';

const MAX_PAGE_SIZE = 7;
const STREAM_START_TIMEOUT_MS = 15000;
const INITIAL_STATIONS = [
  's-kexp', 's-shonan', 's-bush', 's-subela', 's-ibero', 's-nts1', 's-radioone'
].map(id => STATIONS.find(station => station.id === id));
const REGIONS = [...new Set(STATIONS.map(station => station.region))];

const ICONS = {
  scan: 'M20 7v5h-5M4 17v-5h5M5.5 8a7 7 0 0 1 11.2-2L20 9M4 15l3.3 3a7 7 0 0 0 11.2-2',
  search: 'm20 20-4-4m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z',
  external: 'M13 5h6v6m0-6-8 8m6 0v6H5V7h6',
  list: 'M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01',
  left: 'm15 6-6 6 6 6',
  right: 'm9 6 6 6-6 6',
  radio: 'M4 9h16v11H4zM5 9l14-5M8 13h5m-5 3h3m5.5-1h.01'
};

function Icon({ name }) {
  if (ICONS[name]) {
    return (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"
        strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={ICONS[name]} />
      </svg>
    );
  }

  const paths = {
    play: 'M8 4.5 20 12 8 19.5Z',
    stop: 'M7 7h10v10H7Z',
    previous: 'M6 5h2v14H6Zm13 0L9 12l10 7Z',
    next: 'M16 5h2v14h-2ZM5 5v14l10-7Z'
  };

  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  );
}

function searchKey(value) {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

function Dial({ frequency }) {
  const isWeb = frequency === 'LIVE';
  const tuned = Number(frequency);
  const span = 4;
  const start = Math.max(76, Math.min(108 - span, tuned - span / 2));
  const markers = isWeb ? ['Internet stream'] : [0, 1, 2, 3, 4].map(
    offset => (start + offset).toFixed(1)
  );
  const pointer = isWeb ? '50%' : ((tuned - start) / span * 100) + '%';

  return (
    <div className="dial" aria-hidden="true">
      <div className="dial-scale"><span className="dial-pointer" style={{ left: pointer }} /></div>
      <div className={isWeb ? 'dial-labels dial-web' : 'dial-labels'}>
        {markers.map(marker => <span key={marker}>{marker}</span>)}
      </div>
    </div>
  );
}

const INITIAL_ORDER = [
  ...INITIAL_STATIONS,
  ...STATIONS.filter(station => !INITIAL_STATIONS.some(initial => initial.id === station.id))
];
const STATUS_LABELS = { ready: 'Ready', tuning: 'Connecting', live: 'On air', unavailable: 'Unavailable' };

function readViewport() {
  const visual = window.visualViewport;
  const height = visual?.scale === 1 ? Math.min(visual.height, window.innerHeight) : window.innerHeight;
  return { width: window.innerWidth, height: Math.floor(height) };
}

function useViewport() {
  const [viewport, setViewport] = useState(readViewport);
  const focusBeforeResize = useRef(null);
  useEffect(() => {
    function update() {
      const next = readViewport();
      focusBeforeResize.current = document.activeElement;
      setViewport(current => current.width === next.width && current.height === next.height ? current : next);
    }

    window.addEventListener('resize', update);
    window.visualViewport?.addEventListener('resize', update);
    return () => {
      window.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('resize', update);
    };
  }, []);
  return { viewport, focusBeforeResize };
}

function useStationPageSize(visible) {
  const resultsRef = useRef(null);
  const [pageSize, setPageSize] = useState(1);

  useLayoutEffect(() => {
    if (!visible) return;
    const area = resultsRef.current;
    function measure() {
      const styles = getComputedStyle(area);
      const rootFont = parseFloat(getComputedStyle(document.documentElement).fontSize);
      const row = parseFloat(styles.getPropertyValue('--station-row-height')) * rootFont;
      const gap = parseFloat(styles.getPropertyValue('--station-row-gap'));
      const count = Math.floor((area.clientHeight + gap) / (row + gap));
      setPageSize(Math.max(1, Math.min(MAX_PAGE_SIZE, count)));
    }
    const observer = new ResizeObserver(measure);
    measure();
    observer.observe(area);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [visible]);

  return { resultsRef, pageSize };
}

function shuffle(stations) {
  const shuffled = [...stations];
  for (let index = shuffled.length - 1; index > 0; index--) {
    const swap = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swap]] = [shuffled[swap], shuffled[index]];
  }
  return shuffled;
}

export default function App() {
  const { viewport, focusBeforeResize } = useViewport();
  const compact = viewport.width <= 790 || (viewport.width <= 950 && viewport.height <= 460);
  const landscape = compact && viewport.width >= 540 && viewport.width > viewport.height;
  const [browsing, setBrowsing] = useState(false);
  const inDirectory = compact && browsing;
  const showDirectory = !compact || inDirectory;
  const { resultsRef, pageSize } = useStationPageSize(showDirectory);

  const [order, setOrder] = useState(INITIAL_ORDER);
  const [pageAnchor, setPageAnchor] = useState(0);
  const [station, setStation] = useState(INITIAL_ORDER[0]);
  const [search, setSearch] = useState('');
  const [region, setRegion] = useState('');
  const [playback, setPlayback] = useState('ready');
  const [volume, setVolume] = useState(80);
  const audioRef = useRef(null);
  const cancelPlayback = useRef(null);
  const browseRef = useRef(null);
  const backRef = useRef(null);
  const searchRef = useRef(null);
  const restorePanelFocus = useRef(false);

  const query = searchKey(search.trim());
  const filtered = Boolean(query || region);
  const results = filtered ? order.filter(candidate => {
    const { name, location, tags } = candidate;
    const description = [name, location.cityName, location.country, ...tags].join(' ');
    return (!region || candidate.region === region) && searchKey(description).includes(query);
  }) : order;

  const lastPage = Math.max(0, Math.ceil(results.length / pageSize) - 1);
  const page = Math.min(Math.floor(pageAnchor / pageSize), lastPage);
  const start = page * pageSize;
  const end = Math.min(start + pageSize, results.length);
  const pageStations = results.slice(start, end);
  const presets = order.slice(1, 3);
  const stationsToStep = compact && !inDirectory ? order : results;
  const tuning = playback === 'tuning';
  const playing = playback === 'live';
  const canStop = tuning || playing;
  const isWeb = station.freq === 'LIVE';

  useEffect(() => {
    const audio = audioRef.current;
    return () => {
      cancelPlayback.current?.();
      cancelPlayback.current = null;
      audio.pause();
    };
  }, []);

  useLayoutEffect(() => {
    const previous = focusBeforeResize.current;
    const lostFocus = previous && previous !== document.body && (
      !previous.isConnected || !previous.getClientRects().length
    );
    if (restorePanelFocus.current || lostFocus) {
      const destination = inDirectory ? backRef.current : compact ? browseRef.current : searchRef.current;
      destination?.focus({ preventScroll: true });
    }
    focusBeforeResize.current = null;
    restorePanelFocus.current = false;
  }, [compact, inDirectory, viewport, focusBeforeResize]);

  function changePanel(next) {
    restorePanelFocus.current = true;
    setBrowsing(next);
  }

  function turnPage(offset) {
    setPageAnchor((page + offset) * pageSize);
  }

  function scan() {
    if (end < order.length) {
      setOrder([...order.slice(0, end), ...shuffle(order.slice(end))]);
      setPageAnchor(end);
      return;
    }

    const previous = new Set(pageStations.map(candidate => candidate.id));
    setOrder([...shuffle(order.filter(candidate => !previous.has(candidate.id))), ...shuffle(pageStations)]);
    setPageAnchor(0);
  }


  function stopPlayback() {
    cancelPlayback.current?.();
    cancelPlayback.current = null;
    const audio = audioRef.current;
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
  }

  function tune(candidate) {
    const audio = audioRef.current;
    stopPlayback();
    setStation(candidate);
    setPlayback('tuning');

    function connect(index) {
      const stream = candidate.streams[index];
      if (!stream) {
        stopPlayback();
        setPlayback('unavailable');
        return;
      }

      function cleanUp() {
        clearTimeout(timeout);
        audio.removeEventListener('error', tryNextStream);
        audio.removeEventListener('ended', tryNextStream);
      }

      function tryNextStream() {
        if (cancelPlayback.current !== cleanUp) return;
        cleanUp();
        setPlayback('tuning');
        connect(index + 1);
      }

      const timeout = setTimeout(tryNextStream, STREAM_START_TIMEOUT_MS);
      cancelPlayback.current = cleanUp;
      audio.addEventListener('error', tryNextStream);
      audio.addEventListener('ended', tryNextStream);
      audio.volume = volume / 100;
      audio.src = stream.url;
      audio.play().then(() => {
        if (cancelPlayback.current !== cleanUp) return;
        clearTimeout(timeout);
        setPlayback('live');
      }, tryNextStream);
    }

    connect(0);
  }

  function togglePlayback() {
    if (canStop) {
      stopPlayback();
      setPlayback('ready');
    } else {
      tune(station);
    }
  }

  function stepStation(offset) {
    if (!stationsToStep.length) return;
    const index = stationsToStep.findIndex(candidate => candidate.id === station.id);
    const from = index < 0 && offset < 0 ? 0 : index;
    const next = (from + offset + stationsToStep.length) % stationsToStep.length;
    tune(stationsToStep[next]);
    if (!compact) setPageAnchor(next);
  }

  function changeVolume(event) {
    const level = Number(event.target.value);
    setVolume(level);
    audioRef.current.volume = level / 100;
  }

  function clearFilters() {
    setSearch('');
    setRegion('');
    setPageAnchor(0);
  }

  function chooseStation(candidate) {
    tune(candidate);
    if (inDirectory) changePanel(false);
  }

  return (
    <div className="radio-viewport" style={{ '--viewport-height': viewport.height + 'px' }}>
      <main className="radio-shell" data-compact={compact || undefined} data-dense={viewport.height <= 620 || undefined}
        data-tight={viewport.height <= 460 || undefined} data-tiny={viewport.height <= 355 || undefined}
        data-landscape={landscape || undefined} data-roomy={viewport.height >= 720 || undefined}
        data-short-portrait={(compact && !landscape && viewport.height <= 550) || undefined} onKeyDown={event => {
          if (event.key === 'Escape' && inDirectory) changePanel(false);
        }}>
        <header className="brand-bar">
          <div className="brand">
            <span className="brand-mark"><Icon name="radio" /></span>
            <h1>RadioDept<span>.</span></h1>
          </div>
          {inDirectory ? (
            <button type="button" className="back-button" ref={backRef} aria-label="Back to tuner" onClick={() => changePanel(false)}>
              <Icon name="left" /> {viewport.width <= 360 ? 'Tuner' : 'Back to tuner'}
            </button>
          ) : (
            <span className="catalogue-size"><strong>{STATIONS.length}</strong> stations</span>
          )}
        </header>

        <div className="radio-layout">
          {!inDirectory && (
            <section className="tuner" aria-label="Tuner">
              <div className="tuner-display">
                <div className="tuner-readout">
                  <div className="display-top">
                    <span className="panel-label">Now tuned</span>
                    <span className="signal" data-state={playback} role="status">
                      <span className="signal-light" aria-hidden="true" />
                      {STATUS_LABELS[playback]}
                    </span>
                  </div>

                  <div className="frequency">
                    <span>{isWeb ? 'NET' : station.freq}</span>
                    <span className="frequency-unit">{isWeb ? 'Stream' : 'MHz'}</span>
                  </div>

                  <div className="tuned-station">
                    <h2 data-current-station-name>{station.name}</h2>
                    <p className="station-location">
                      <span>{station.location.cityName}</span>
                      <span className="location-country">{station.location.country}</span>
                    </p>
                  </div>

                  <div className="station-details">
                    <ul className="station-tags" aria-label="Genres">
                      {station.tags.map(tag => <li key={tag}>{tag}</li>)}
                    </ul>
                    <a href={station.website} target="_blank" rel="noopener noreferrer">
                      Station site <Icon name="external" />
                    </a>
                  </div>
                  {playback === 'unavailable' && (
                    <p className="stream-error">Try Play again or choose another station.</p>
                  )}
                </div>
              </div>

              <div className="tuner-actions">
                <div className="control-panel">
                  <Dial frequency={station.freq} />
                  <div className="control-deck">
                    <div className="transport" aria-label="Playback controls" role="group">
                      <button type="button" className="icon-button" onClick={() => stepStation(-1)}
                        aria-label="Previous station" disabled={!stationsToStep.length}>
                        <Icon name="previous" />
                      </button>
                      <button type="button" className="play-button" onClick={togglePlayback}
                        aria-label={canStop ? 'Stop stream' : 'Play station'}>
                        <Icon name={canStop ? 'stop' : 'play'} />
                        {tuning ? 'Cancel' : playing ? 'Stop' : 'Play'}
                      </button>
                      <button type="button" className="icon-button" onClick={() => stepStation(1)}
                        aria-label="Next station" disabled={!stationsToStep.length}>
                        <Icon name="next" />
                      </button>
                    </div>

                    <label className="volume">
                      <span>Volume</span>
                      <input type="range" min="0" max="100" step="1" value={volume} onChange={changeVolume} />
                      <output aria-hidden="true">{volume}%</output>
                    </label>
                  </div>
                </div>

                {compact && (
                  <div className="preset-panel" role="group" aria-label="Station shortcuts">
                    <button type="button" className="browse-button" ref={browseRef}
                      onClick={() => changePanel(true)}>
                      <Icon name="list" /> <span>Browse stations</span> <Icon name="right" />
                    </button>
                    <div className="preset-grid">
                      {presets.map(candidate => (
                        <button type="button" className="station-preset" key={candidate.id}
                          aria-label={'Tune ' + candidate.name} aria-current={station.id === candidate.id ? 'true' : undefined}
                          onClick={() => tune(candidate)}>
                          <span className="preset-name">{candidate.name}</span>
                          <span className="preset-frequency">{candidate.freq === 'LIVE' ? 'Web' : candidate.freq}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {showDirectory && (
            <section className="directory" aria-labelledby="directory-title">
              <div className="directory-toolbar">
                <div className="directory-header">
                  <h2 id="directory-title">Station directory</h2>
                  {filtered ? (
                    <button type="button" className="scan-button" aria-label="Clear filters" onClick={clearFilters}>
                      {viewport.height <= 355 ? 'Clear' : 'Clear filters'}
                    </button>
                  ) : (
                    <button type="button" className="scan-button" onClick={scan}>
                      <Icon name="scan" /> Scan
                    </button>
                  )}
                </div>

                <div className="directory-filters">
                  <label className="search-field">
                    <Icon name="search" />
                    <input type="search" ref={searchRef} aria-label="Search stations" placeholder={compact ? 'Search' : 'Search stations'}
                      value={search} onChange={event => { setSearch(event.target.value); setPageAnchor(0); }} />
                  </label>
                  <select aria-label="Filter by region" value={region}
                    onChange={event => { setRegion(event.target.value); setPageAnchor(0); }}>
                    <option value="">All regions</option>
                    {REGIONS.map(label => <option key={label}>{label}</option>)}
                  </select>
                </div>
              </div>

              <div className="directory-results" ref={resultsRef}>
                <ul className="station-list">
                  {pageStations.map(candidate => (
                    <li key={candidate.id}>
                      <button type="button" className="station-row"
                        aria-current={station.id === candidate.id ? 'true' : undefined}
                        onClick={() => chooseStation(candidate)}>
                        <span className="station-row-text">
                          <span className="station-name" data-station-name>{candidate.name}</span>
                          <span className="station-country">{candidate.location.country}</span>
                        </span>
                        <span className="row-frequency">{candidate.freq === 'LIVE' ? 'Web' : candidate.freq}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>

              <nav className="directory-pagination" aria-label="Station pages">
                <button type="button" className="icon-button" aria-label="Previous page"
                  disabled={page === 0} onClick={() => turnPage(-1)}><Icon name="left" /></button>
                <p className="page-status" role="status">
                  {results.length ? (start + 1 === end ? end : (start + 1) + '–' + end) + ' of ' + results.length : 'No stations found'}
                </p>
                <button type="button" className="icon-button" aria-label="Next page"
                  disabled={page === lastPage} onClick={() => turnPage(1)}><Icon name="right" /></button>
              </nav>
            </section>
          )}
        </div>

        <audio ref={audioRef} preload="none" />
      </main>
    </div>
  );
}
