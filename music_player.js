document.addEventListener('DOMContentLoaded', () => {
  const rows = Array.from(document.querySelectorAll('tbody tr'))
    .filter(row => !row.classList.contains('non-track-row') && row.querySelector('audio'));
  const items = rows.map(row => {
    const audio = row.querySelector('audio');
    const durationEl = row.querySelector('.duration');
    const titleCell = row.querySelector('td');
    const title = titleCell.textContent.trim();
    const playIndicator = document.createElement('span');
    playIndicator.className = 'track-play-indicator';
    playIndicator.setAttribute('aria-hidden', 'true');
    const titleLabel = document.createElement('span');
    titleLabel.textContent = title;
    titleCell.replaceChildren(playIndicator, titleLabel);
    return { row, audio, durationEl, title, playIndicator };
  });

  const playAllButton = document.getElementById('playAll');
  const nowTitle = document.getElementById('nowTitle');
  const nowPlayBtn = document.getElementById('nowPlayBtn');
  const nowRange = document.getElementById('nowRange');
  const nowTime = document.getElementById('nowTime');

  let nowActive = null;
  let playAllActive = false;
  let playAllIndex = 0;

  const formatTime = (seconds) => {
    if (!Number.isFinite(seconds)) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const stopOtherTracks = (current) => {
    items.forEach(it => {
      if (it.audio !== current) {
        it.audio.pause();
        it.audio.currentTime = 0;
      }
    });
  };

  const playTrack = (audio, title, restartFromBeginning = true) => {
    if (!audio) return;
    stopOtherTracks(audio);
    if (restartFromBeginning) audio.currentTime = 0;
    if (title) {
      setNowPlaying(audio, title);
    } else if (nowActive === audio) {
      setNowPlaying(audio, nowTitle.textContent !== 'Not playing' ? nowTitle.textContent : 'Unknown');
    }
    audio.play();
  };

  const highlightRow = (row) => {
    document.querySelectorAll('tbody tr').forEach(tr => tr.classList.remove('active-row'));
    if (row) row.classList.add('active-row');
  };

  const updateRowPlayIndicators = (audio, isPlaying) => {
    items.forEach(it => {
      const isCurrentTrack = it.audio === audio;
      it.playIndicator.classList.toggle('is-visible', isCurrentTrack);
      it.playIndicator.textContent = isCurrentTrack ? (isPlaying ? '⏸' : '▶') : '';
    });
  };

  const setNowPlaying = (audio, title) => {
    nowActive = audio;
    nowTitle.textContent = title || 'Unknown';
    nowPlayBtn.textContent = audio.paused ? '▶' : '⏸';
    updateRowPlayIndicators(audio, !audio.paused);
    nowRange.disabled = false;
    nowTime.textContent = audio.duration ? `${formatTime(audio.currentTime)} / ${formatTime(audio.duration)}` : '00:00 / --:--';
    nowRange.value = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0;
    // update Media Session metadata so external devices (cars, speakers) show track info
    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: title || 'Unknown',
          artist: '',
          album: '',
        });
        navigator.mediaSession.playbackState = audio.paused ? 'paused' : 'playing';
      } catch (e) {
        // ignore if unsupported
      }
    }
  };

  const clearNowPlaying = () => {
    nowActive = null;
    nowTitle.textContent = 'Not playing';
    nowPlayBtn.textContent = '▶';
    updateRowPlayIndicators(null, false);
    nowRange.value = 0;
    nowRange.disabled = true;
    nowTime.textContent = '00:00 / --:--';
    highlightRow(null);
  };

  nowRange.disabled = true;

  const metronomeState = {
    audioContext: null,
    intervalId: null,
    isRunning: false,
    currentRow: null,
  };

  const getMetronomeAudioContext = () => {
    if (!metronomeState.audioContext) {
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtor) return null;
      metronomeState.audioContext = new AudioCtor();
    }
    return metronomeState.audioContext;
  };

  const playMetronomeClick = () => {
    const audioContext = getMetronomeAudioContext();
    if (!audioContext) return;

    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }

    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.type = 'square';
    oscillator.frequency.value = 440;
    gainNode.gain.setValueAtTime(0.0001, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.25, audioContext.currentTime + 0.005);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.08);

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.09);
  };

  const setClickButtonState = (button, isActive) => {
    button.classList.toggle('is-active', isActive);
    const icon = button.querySelector('.click-icon');
    if (icon) {
      icon.textContent = isActive ? '⏸' : '▶';
    }
  };

  const stopMetronome = () => {
    if (metronomeState.intervalId) {
      clearInterval(metronomeState.intervalId);
      metronomeState.intervalId = null;
    }
    metronomeState.isRunning = false;
    metronomeState.currentRow = null;

    document.querySelectorAll('.click-track-button').forEach(button => {
      setClickButtonState(button, false);
    });
  };

  const startMetronome = (button) => {
    if (!button) return;

    const row = button.closest('tr');
    const bpm = Number(button.dataset.bpm || 120);
    if (!row || !Number.isFinite(bpm) || bpm <= 0) return;

    if (metronomeState.currentRow && metronomeState.currentRow !== row) {
      stopMetronome();
    }

    const intervalMs = (60 / bpm) * 1000;
    metronomeState.currentRow = row;
    metronomeState.isRunning = true;
    setClickButtonState(button, true);
    playMetronomeClick();
    metronomeState.intervalId = setInterval(() => {
      if (!metronomeState.isRunning || metronomeState.currentRow !== row) return;
      playMetronomeClick();
    }, intervalMs);
  };

  document.querySelectorAll('.chords-link, .bass-tab-link, .click-track-button').forEach(link => {
    link.addEventListener('click', (event) => {
      event.stopPropagation();
    });
  });

  document.querySelectorAll('.click-track-button').forEach(button => {
    if (!button.dataset.bpm) {
      button.dataset.bpm = '120';
    }
    button.innerHTML = `<span class="click-icon">▶</span> <span class="click-label">Click [${button.dataset.bpm}]</span>`;

    button.addEventListener('click', (event) => {
      event.stopPropagation();
      const row = button.closest('tr');
      if (!row) return;

      if (metronomeState.currentRow === row && metronomeState.isRunning) {
        stopMetronome();
        return;
      }

      startMetronome(button);
    });
  });

  // Media Session API: wire device display and remote controls when available
  if ('mediaSession' in navigator) {
    try {
      navigator.mediaSession.setActionHandler('play', () => {
        if (nowActive) {
          playTrack(nowActive, nowTitle.textContent !== 'Not playing' ? nowTitle.textContent : 'Unknown', false);
        } else if (items.length) {
          playTrack(items[0].audio, items[0].title);
        }
      });
      navigator.mediaSession.setActionHandler('pause', () => {
        if (nowActive) nowActive.pause();
      });
      navigator.mediaSession.setActionHandler('previoustrack', () => {
        if (!nowActive) return;
        const idx = items.findIndex(it => it.audio === nowActive);
        if (idx > 0) playTrack(items[idx - 1].audio, items[idx - 1].title);
      });
      navigator.mediaSession.setActionHandler('nexttrack', () => {
        if (!nowActive) return;
        const idx = items.findIndex(it => it.audio === nowActive);
        if (idx >= 0 && idx < items.length - 1) playTrack(items[idx + 1].audio, items[idx + 1].title);
      });
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (!nowActive || !nowActive.duration) return;
        if (details.fastSeek && 'fastSeek' in nowActive) {
          nowActive.fastSeek(details.seekTime);
        } else {
          nowActive.currentTime = details.seekTime;
        }
      });
    } catch (e) {
      // ignore if handlers not supported
    }
  }

  // wire items
  items.forEach((it, idx) => {
    const { row, audio, durationEl, title } = it;

    // populate duration when available
    audio.addEventListener('loadedmetadata', () => {
      if (durationEl) durationEl.textContent = formatTime(audio.duration || 0);
      if (nowActive === audio) setNowPlaying(audio, title);
    });

    audio.addEventListener('timeupdate', () => {
      if (nowActive === audio) {
        nowRange.value = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0;
        nowTime.textContent = `${formatTime(audio.currentTime)} / ${formatTime(audio.duration)}`;
      }
    });

    audio.addEventListener('play', () => {
      setNowPlaying(audio, title);
      highlightRow(row);
    });
    audio.addEventListener('pause', () => {
      nowPlayBtn.textContent = '▶';
      if (nowActive === audio) updateRowPlayIndicators(audio, false);
      // remove highlight on pause
      if (nowActive === audio) highlightRow(null);
    });
    audio.addEventListener('ended', () => {
      if (playAllActive && items[playAllIndex] && items[playAllIndex].audio === audio) {
        playAllIndex += 1;
        if (playAllIndex < items.length) {
          items[playAllIndex].audio.play();
        } else {
          playAllActive = false;
          clearNowPlaying();
        }
      } else {
        if (nowActive === audio) clearNowPlaying();
      }
    });

    // click row to play/pause this track
    row.addEventListener('click', () => {
      if (nowActive === audio) {
        if (audio.paused) {
          playTrack(audio, title, false);
        } else {
          audio.pause();
        }
        return;
      }
      playAllActive = false;
      playTrack(audio, title);
    });
  });

  nowPlayBtn.addEventListener('click', () => {
    if (!nowActive) return;
    if (nowActive.paused) {
      playTrack(nowActive, nowTitle.textContent !== 'Not playing' ? nowTitle.textContent : 'Unknown', false);
    } else {
      nowActive.pause();
    }
  });

  nowRange.addEventListener('input', (e) => {
    if (!nowActive || !nowActive.duration) return;
    const ratio = Number(e.target.value) / 100;
    nowActive.currentTime = ratio * nowActive.duration;
  });

  playAllButton.addEventListener('click', () => {
    playAllActive = true;
    playAllIndex = 0;
    items.forEach(it => { it.audio.pause(); it.audio.currentTime = 0; if (it.durationEl) it.durationEl.textContent = formatTime(it.audio.duration || 0); });
    clearNowPlaying();
    if (items.length) playTrack(items[0].audio, items[0].title);
  });
});