import { useEffect, useRef, useState } from 'react';
import { STATIONS } from './stations.js';

const PAGE_SIZE = 7;
const STREAM_START_TIMEOUT_MS = 15000;
const INITIAL_STATIONS = [
  's-kexp', 's-shonan', 's-bush', 's-subela', 's-ibero', 's-nts1', 's-radioone'
].map(id => STATIONS.find(station => station.id === id));
const REGIONS = [...new Set(STATIONS.map(station => station.region))];

const ICONS = {
  scan: 'M20 7v5h-5M4 17v-5h5M5.5 8a7 7 0 0 1 11.2-2L20 9M4 15l3.3 3a7 7 0 0 0 11.2-2',
  search: 'm20 20-4-4m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z',
  external: 'M13 5h6v6m0-6-8 8m6 0v6H5V7h6',
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

export default function App() {
  const [scanPage, setScanPage] = useState(INITIAL_STATIONS);
  const [station, setStation] = useState(INITIAL_STATIONS[0]);
  const [search, setSearch] = useState('');
  const [region, setRegion] = useState('');
  const [playback, setPlayback] = useState('ready');
  const [volume, setVolume] = useState(80);
  const audioRef = useRef(null);
  const cancelPlayback = useRef(null);
  const scanQueue = useRef([]);

  const query = searchKey(search.trim());
  const filtered = Boolean(query || region);
  const visibleStations = filtered ? STATIONS.filter(candidate => {
    const { name, location, tags } = candidate;
    const description = [name, location.cityName, location.country, ...tags].join(' ');
    return (!region || candidate.region === region) && searchKey(description).includes(query);
  }) : scanPage;

  const tuning = playback === 'tuning';
  const playing = playback === 'live';
  const canStop = tuning || playing;
  const isWeb = station.freq === 'LIVE';
  const statusLabels = { ready: 'Ready', tuning: 'Connecting', live: 'On air', unavailable: 'Unavailable' };

  useEffect(() => {
    const audio = audioRef.current;
    return () => {
      cancelPlayback.current?.();
      cancelPlayback.current = null;
      audio.pause();
    };
  }, []);

  function scan() {
    const next = scanQueue.current.splice(0, PAGE_SIZE);
    if (next.length < PAGE_SIZE) {
      const excluded = new Set([...scanPage, ...next].map(candidate => candidate.id));
      const pool = STATIONS.filter(candidate => !excluded.has(candidate.id));
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      next.push(...pool.splice(0, PAGE_SIZE - next.length));
      scanQueue.current = pool;
    }
    setScanPage(next);
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
    if (visibleStations.length === 0) return;
    const index = visibleStations.findIndex(candidate => candidate.id === station.id);
    const start = index < 0 && offset < 0 ? 0 : index;
    const next = (start + offset + visibleStations.length) % visibleStations.length;
    tune(visibleStations[next]);
  }

  function changeVolume(event) {
    const level = Number(event.target.value);
    setVolume(level);
    audioRef.current.volume = level / 100;
  }

  function clearFilters() {
    setSearch('');
    setRegion('');
  }

  return (
    <main className="radio-shell">
      <header className="brand-bar">
        <div className="brand">
          <span className="brand-mark"><Icon name="radio" /></span>
          <h1>RadioDept<span>.</span></h1>
        </div>
        <span className="catalogue-size"><strong>{STATIONS.length}</strong> stations</span>
      </header>

      <div className="radio-layout">
        <section className="tuner" aria-label="Tuner">
          <div className="tuner-display">
            <div className="display-top">
              <span className="panel-label">Now tuned</span>
              <span className="signal" data-state={playback} role="status">
                <span className="signal-light" aria-hidden="true" />
                {statusLabels[playback]}
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
              <p className="stream-error">This stream didn’t connect. Try Play again or choose another station.</p>
            )}
          </div>

          <div className="control-panel">
            <Dial frequency={station.freq} />
            <div className="control-deck">
              <div className="transport" aria-label="Playback controls" role="group">
                <button type="button" className="icon-button" onClick={() => stepStation(-1)}
                  aria-label="Previous station" disabled={visibleStations.length === 0}>
                  <Icon name="previous" />
                </button>
                <button type="button" className="play-button" onClick={togglePlayback}
                  aria-label={canStop ? 'Stop stream' : 'Play station'}>
                  <Icon name={canStop ? 'stop' : 'play'} />
                  {tuning ? 'Cancel' : playing ? 'Stop' : 'Play'}
                </button>
                <button type="button" className="icon-button" onClick={() => stepStation(1)}
                  aria-label="Next station" disabled={visibleStations.length === 0}>
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
        </section>

        <section className="directory" aria-labelledby="directory-title">
          <div className="directory-header">
            <h2 id="directory-title">Station directory</h2>
            {filtered ? (
              <button type="button" className="scan-button" onClick={clearFilters}>Clear filters</button>
            ) : (
              <button type="button" className="scan-button" onClick={scan}>
                <Icon name="scan" /> Scan
              </button>
            )}
          </div>

          <div className="directory-filters">
            <label className="search-field">
              <Icon name="search" />
              <input type="search" aria-label="Search stations" placeholder="Search stations"
                value={search} onChange={event => setSearch(event.target.value)} />
            </label>
            <select aria-label="Filter by region" value={region} onChange={event => setRegion(event.target.value)}>
              <option value="">All regions</option>
              {REGIONS.map(label => <option key={label}>{label}</option>)}
            </select>
          </div>

          {filtered && (
            <p className="results-count" role="status">
              {visibleStations.length} {visibleStations.length === 1 ? 'station' : 'stations'} found
            </p>
          )}

          <ul className="station-list">
            {visibleStations.map(candidate => (
              <li key={candidate.id}>
                <button type="button" className="station-row"
                  aria-current={station.id === candidate.id ? 'true' : undefined}
                  onClick={() => tune(candidate)}>
                  <span className="station-row-text">
                    <span className="station-name" data-station-name>{candidate.name}</span>
                    <span className="station-country">{candidate.location.country}</span>
                  </span>
                  <span className="row-frequency">{candidate.freq === 'LIVE' ? 'Web' : candidate.freq}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <audio ref={audioRef} preload="none" />
    </main>
  );
}
