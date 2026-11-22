import React, { useEffect, useRef, useState } from 'react';

const COLLEGE_STATIONS = [
  { id: 'dept-wers', name: 'WERS 88.9 FM', campus: 'Emerson College', location: { cityName: 'Boston', countryCode: 'us', region: 'east' }, streams: [{ url: 'https://wers.streamguys1.com/wers-mp3' }], freq: '88.9', genre: 'Indie, Alt-Rock, College Discovery' },
  { id: 'dept-wxyc', name: 'WXYC 89.3 FM', campus: 'UNC Chapel Hill', location: { cityName: 'Chapel Hill', countryCode: 'us', region: 'east' }, streams: [{ url: 'https://wxyc.info/WXYC893.mp3' }], freq: '89.3', genre: 'Avant-Garde, Underground, Eclectic' },
  { id: 'dept-kexp', name: 'KEXP 90.3 FM', campus: 'University of Washington', location: { cityName: 'Seattle', countryCode: 'us', region: 'west' }, streams: [{ url: 'https://kexp-mp3-128.streamguys1.com/kexp128.mp3' }], freq: '90.3', genre: 'Alternative, Post-Punk, Local Scene' },
  { id: 'dept-wkdu', name: 'WKDU 91.7 FM', campus: 'Drexel University', location: { cityName: 'Philadelphia', countryCode: 'us', region: 'east' }, streams: [{ url: 'https://wkdu.org/stream/128.mp3' }], freq: '91.7', genre: 'Indie Rock, Punk, Reggae, Noise' },
  { id: 'dept-bagel', name: 'BAGeL Radio', campus: 'SomaFM Independent Network', location: { cityName: 'San Francisco', countryCode: 'us', region: 'west' }, streams: [{ url: 'https://ice1.somafm.com/bagel-128-mp3' }], freq: 'LIVE', genre: 'Indie Pop, Modern Rock, Garage Punk' },
  { id: 'dept-radio-u', name: 'Radio 1 (MDR)', campus: 'Leipzig Campus Broadcaster', location: { cityName: 'Leipzig', countryCode: 'de', region: 'intl' }, streams: [{ url: 'https://mdr-284310-0.sslcast.mdr.de/mdr/284310/0/mp3/high/stream.mp3' }], freq: '91.3', genre: 'European Indie, Experimental Synth' }
];

export default function App() {
  const [stations, setStations] = useState(COLLEGE_STATIONS);
  const [selectedRegion, setSelectedRegion] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentStation, setCurrentStation] = useState(COLLEGE_STATIONS[0]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [playerLoading, setPlayerLoading] = useState(false);
  const [playerError, setPlayerError] = useState('');
  const audioRef = useRef(null);

  const filterStations = (query = searchQuery, region = selectedRegion) => {
    const lowered = query.toLowerCase();
    const byRegion = region === 'all' ? COLLEGE_STATIONS : COLLEGE_STATIONS.filter((s) => s.location.region === region);
    const byText = lowered
      ? byRegion.filter((s) => [s.name, s.campus, s.genre].some((v) => v.toLowerCase().includes(lowered)))
      : byRegion;
    setStations(byText);
  };

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  const playStation = async (station) => {
    setCurrentStation(station);
    setPlayerError('');
    if (!audioRef.current || !station.streams?.[0]?.url) return;
    setPlayerLoading(true);
    try {
      audioRef.current.src = station.streams[0].url;
      await audioRef.current.play();
      setIsPlaying(true);
    } catch {
      setPlayerError('Stream unavailable or blocked by browser autoplay policy.');
      setIsPlaying(false);
    } finally {
      setPlayerLoading(false);
    }
  };

  const togglePlay = async () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
      return;
    }
    setPlayerLoading(true);
    try {
      await audioRef.current.play();
      setIsPlaying(true);
      setPlayerError('');
    } catch {
      setPlayerError('Unable to resume stream.');
    } finally {
      setPlayerLoading(false);
    }
  };

  return (
    <div className="app">
      <header>
        <h1>Radio Dept.</h1>
        <p>Global college and indie radio tuner.</p>
      </header>

      <div className="controls">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            filterStations(searchQuery, selectedRegion);
          }}
        >
          <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search station, campus, genre" />
          <button type="submit">Search</button>
        </form>
        <div className="regions">
          {['all', 'east', 'west', 'intl'].map((region) => (
            <button
              key={region}
              className={selectedRegion === region ? 'active' : ''}
              onClick={() => {
                setSelectedRegion(region);
                filterStations(searchQuery, region);
              }}
            >
              {region.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <main>
        <section className="player">
          <h2>{currentStation.name}</h2>
          <p>{currentStation.campus}</p>
          <p>{currentStation.location.cityName}, {currentStation.location.countryCode.toUpperCase()} · {currentStation.genre}</p>
          <button onClick={togglePlay}>{playerLoading ? '...' : isPlaying ? 'Pause' : 'Play'}</button>
          <input type="range" min="0" max="1" step="0.01" value={volume} onChange={(e) => setVolume(Number(e.target.value))} />
          {playerError && <p className="error">{playerError}</p>}
        </section>

        <section className="list">
          {stations.map((station) => (
            <button key={station.id} className="station" onClick={() => playStation(station)}>
              <strong>{station.freq} · {station.name}</strong>
              <span>{station.campus}</span>
              <small>{station.location.cityName}, {station.location.countryCode.toUpperCase()}</small>
            </button>
          ))}
          {stations.length === 0 && <p>No stations found.</p>}
        </section>
      </main>

      <audio ref={audioRef} onError={() => setPlayerError('Stream failed.')} />
    </div>
  );
}
