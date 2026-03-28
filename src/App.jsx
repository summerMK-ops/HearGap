import { useEffect, useMemo, useRef, useState } from "react";

const LOOP_OPTIONS = [1, 3];
const SPEED_OPTIONS = [1, 0.8, 0.6];
const STORAGE_KEY = "heargap-workspace";
const VOICE_STORAGE_KEY = "heargap-voice-uri";

const DEFAULT_TEXT = `What are you doing?
I didn't get a chance to call you.
A lot of people missed it.`;

const tokenize = (text) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9'\s]/g, "")
    .split(/\s+/)
    .filter(Boolean);

const compareDictation = (input, answer) => {
  const guessed = tokenize(input);
  const correct = tokenize(answer);

  return correct.map((word, index) => ({
    word,
    ok: guessed[index] === word,
  }));
};

const splitIntoSentences = (text) => {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return [];
  }

  return normalized
    .split(/\n+/)
    .flatMap((line) => line.match(/[^.!?\n]+[.!?]?/g) ?? [])
    .map((sentence) => sentence.trim())
    .filter(Boolean);
};

const scoreEnglishVoice = (voice) => {
  const name = (voice.name ?? "").toLowerCase();
  const lang = (voice.lang ?? "").toLowerCase();

  let score = 0;

  if (lang === "en-us") score += 100;
  else if (lang.startsWith("en-")) score += 70;

  if (/google/.test(name)) score += 40;
  if (/microsoft/.test(name)) score += 35;
  if (/natural|neural|premium|enhanced|aria|jenny|guy|davis|samantha/.test(name)) score += 30;
  if (/zira|hazel|daniel|alex|serena|allison|ava|andrew/.test(name)) score += 20;
  if (/japanese|kyoko|haruka|ichiro/.test(name)) score -= 200;
  if (voice.default) score += 10;

  return score;
};

const getEnglishVoices = () => {
  if (typeof window === "undefined" || !window.speechSynthesis) {
    return [];
  }

  return window.speechSynthesis
    .getVoices()
    .filter((voice) => voice.lang?.toLowerCase().startsWith("en") || /english|google|microsoft/i.test(voice.name))
    .sort((a, b) => scoreEnglishVoice(b) - scoreEnglishVoice(a));
};

const pickEnglishVoice = (voices, preferredVoiceURI) => {
  if (!voices.length) {
    return null;
  }

  if (preferredVoiceURI) {
    const matched = voices.find((voice) => voice.voiceURI === preferredVoiceURI);
    if (matched) {
      return matched;
    }
  }

  return voices[0] ?? null;
};

function EditorCard({ text, onTextChange, onApply, sentenceCount }) {
  return (
    <section className="card">
      <p className="section-label">Source Text</p>
      <h2>英文を貼り付けて Sync View を作る</h2>
      <p className="muted">
        改行か句読点で文分割します。教材一覧は持たず、この画面だけでそのまま練習できます。
      </p>
      <textarea
        className="source-textarea"
        value={text}
        onChange={(event) => onTextChange(event.target.value)}
        placeholder="What are you doing?"
      />
      <div className="editor-actions">
        <button className="primary-button" onClick={onApply}>
          Sync View を更新
        </button>
        <span className="muted">{sentenceCount}文を検出</span>
      </div>
    </section>
  );
}

function SentenceRail({ sentences, activeIndex, onSelect }) {
  return (
    <section className="card">
      <p className="section-label">Sentences</p>
      <div className="sentence-rail">
        {sentences.map((sentence, index) => (
          <button
            key={`${sentence}-${index}`}
            className={index === activeIndex ? "sentence-chip active" : "sentence-chip"}
            onClick={() => onSelect(index)}
          >
            {index + 1}. {sentence}
          </button>
        ))}
      </div>
    </section>
  );
}

function PracticePanel({
  sentence,
  currentIndex,
  totalSentences,
  onPrev,
  onNext,
  audioSource,
  setAudioSource,
}) {
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loopCount, setLoopCount] = useState(1);
  const [speed, setSpeed] = useState(1);
  const [dictation, setDictation] = useState("");
  const [showResult, setShowResult] = useState(false);
  const [recordingState, setRecordingState] = useState("idle");
  const [recordedUrl, setRecordedUrl] = useState("");
  const [englishVoices, setEnglishVoices] = useState([]);
  const [englishVoice, setEnglishVoice] = useState(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timeoutRef = useRef([]);
  const streamRef = useRef(null);
  const audioRef = useRef(null);

  const words = useMemo(() => sentence.split(" "), [sentence]);
  const dictationResult = useMemo(() => compareDictation(dictation, sentence), [dictation, sentence]);

  useEffect(() => {
    const updateVoice = () => {
      const voices = getEnglishVoices();
      setEnglishVoices(voices);
      setEnglishVoice(pickEnglishVoice(voices, window.localStorage.getItem(VOICE_STORAGE_KEY)));
    };

    updateVoice();
    window.speechSynthesis?.addEventListener?.("voiceschanged", updateVoice);

    return () => {
      window.speechSynthesis?.removeEventListener?.("voiceschanged", updateVoice);
    };
  }, []);

  useEffect(() => {
    setHighlightIndex(-1);
    setIsPlaying(false);
    setDictation("");
    setShowResult(false);
    setRecordedUrl("");
    setRecordingState("idle");
    window.speechSynthesis.cancel();
    timeoutRef.current.forEach((id) => window.clearTimeout(id));
    timeoutRef.current = [];
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }, [sentence]);

  useEffect(() => {
    return () => {
      window.speechSynthesis.cancel();
      timeoutRef.current.forEach((id) => window.clearTimeout(id));
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const scheduleHighlights = (durationMs, gapMs = 0) => {
    const totalWords = Math.max(words.length, 1);
    for (let loop = 0; loop < loopCount; loop += 1) {
      const startOffset = loop * (durationMs + gapMs);
      words.forEach((_, index) => {
        const wordOffset = startOffset + (durationMs / totalWords) * index;
        const highlightId = window.setTimeout(() => setHighlightIndex(index), wordOffset);
        timeoutRef.current.push(highlightId);
      });
    }
  };

  const runNativeAudioPlayback = () => {
    if (!audioSource.url) {
      return false;
    }

    timeoutRef.current.forEach((id) => window.clearTimeout(id));
    timeoutRef.current = [];
    setIsPlaying(true);

    const audio = new Audio(audioSource.url);
    audioRef.current = audio;
    audio.playbackRate = speed;
    const durationMs = Math.max((audioSource.duration || 2.2) * 1000 / speed, 1800);
    scheduleHighlights(durationMs, 500);

    const playLoop = (count) => {
      audio.currentTime = 0;
      audio.playbackRate = speed;
      audio.play().catch(() => {
        setIsPlaying(false);
      });

      audio.onended = () => {
        if (count + 1 < loopCount) {
          const nextId = window.setTimeout(() => playLoop(count + 1), 500);
          timeoutRef.current.push(nextId);
          return;
        }

        setIsPlaying(false);
        setHighlightIndex(-1);
      };
    };

    playLoop(0);
    return true;
  };

  const runTtsPlayback = () => {
    window.speechSynthesis.cancel();
    timeoutRef.current.forEach((id) => window.clearTimeout(id));
    timeoutRef.current = [];
    setIsPlaying(true);

    const durationMs = Math.max(2200, sentence.length * 90) / speed;
    scheduleHighlights(durationMs, 500);

    for (let loop = 0; loop < loopCount; loop += 1) {
      const utterance = new SpeechSynthesisUtterance(sentence);
      utterance.lang = englishVoice?.lang ?? "en-US";
      utterance.rate = speed;
      utterance.pitch = 1;
      if (englishVoice) {
        utterance.voice = englishVoice;
      }

      utterance.onend = () => {
        if (loop === loopCount - 1) {
          const endingId = window.setTimeout(() => {
            setIsPlaying(false);
            setHighlightIndex(-1);
          }, 250);
          timeoutRef.current.push(endingId);
        }
      };

      const startOffset = loop * (durationMs + 500);
      const speakId = window.setTimeout(() => window.speechSynthesis.speak(utterance), startOffset);
      timeoutRef.current.push(speakId);
    }
  };

  const runPlayback = () => {
    if (runNativeAudioPlayback()) {
      return;
    }
    runTtsPlayback();
  };

  const handleVoiceChange = (event) => {
    const voiceURI = event.target.value;
    window.localStorage.setItem(VOICE_STORAGE_KEY, voiceURI);
    setEnglishVoice(englishVoices.find((voice) => voice.voiceURI === voiceURI) ?? null);
  };

  const handleAudioUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const url = URL.createObjectURL(file);
    const probe = new Audio(url);
    probe.onloadedmetadata = () => {
      setAudioSource({
        name: file.name,
        url,
        duration: probe.duration || 0,
      });
    };
    probe.onerror = () => {
      setAudioSource({
        name: file.name,
        url,
        duration: 0,
      });
    };
  };

  const toggleRecording = async () => {
    if (recordingState === "recording") {
      mediaRecorderRef.current?.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setRecordingState("processing");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const url = URL.createObjectURL(blob);
        setRecordedUrl(url);
        setRecordingState("done");
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecordingState("recording");
    } catch {
      setRecordingState("blocked");
    }
  };

  return (
    <section className="card practice-card">
      <div className="player-top">
        <div>
          <p className="section-label">Lesson</p>
          <h2>
            {currentIndex + 1} / {totalSentences}
          </h2>
        </div>
        <div className="editor-actions">
          <button className="ghost-button" onClick={onPrev} disabled={currentIndex === 0}>
            前へ
          </button>
          <button className="ghost-button" onClick={onNext} disabled={currentIndex === totalSentences - 1}>
            次へ
          </button>
        </div>
      </div>

      <div className="player-top">
        <div>
          <p className="section-label">Playback</p>
          <h3>{isPlaying ? "再生中" : "待機中"}</h3>
        </div>
        <button className="primary-button" onClick={runPlayback}>
          再生する
        </button>
      </div>

      <div className="player-bar">
        {words.map((word, index) => (
          <span key={`${word}-${index}`} className={index === highlightIndex ? "word active" : "word"}>
            {word}
          </span>
        ))}
      </div>

      <div className="sync-panel">
        <p className="section-label">Sync View</p>
        <h3>{sentence}</h3>
        <p className="muted">
          まずは貼り付け英文をそのまま 1 文単位で練習します。ネイティブ感を上げたい場合は下で実音声をアップロードしてください。
        </p>
      </div>

      <div className="control-grid">
        <div>
          <p className="control-label">ループ</p>
          <div className="option-row">
            {LOOP_OPTIONS.map((value) => (
              <button
                key={value}
                className={value === loopCount ? "option active" : "option"}
                onClick={() => setLoopCount(value)}
              >
                {value}回
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="control-label">速度</p>
          <div className="option-row">
            {SPEED_OPTIONS.map((value) => (
              <button
                key={value}
                className={value === speed ? "option active" : "option"}
                onClick={() => setSpeed(value)}
              >
                {value}x
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="control-label">Voice</p>
          {englishVoices.length ? (
            <select className="voice-select" value={englishVoice?.voiceURI ?? ""} onChange={handleVoiceChange}>
              {englishVoices.map((voice) => (
                <option key={voice.voiceURI} value={voice.voiceURI}>
                  {voice.name} ({voice.lang})
                </option>
              ))}
            </select>
          ) : (
            <p className="error-text">英語音声が見つかりません。OSの英語音声を追加してください。</p>
          )}
        </div>
        <div>
          <p className="control-label">Native Audio</p>
          <label className="upload-button">
            実音声をアップロード
            <input type="file" accept="audio/*" onChange={handleAudioUpload} />
          </label>
          <p className="muted">
            {audioSource.name
              ? `${audioSource.name} を優先再生中`
              : "未設定時はブラウザ英語音声で再生します"}
          </p>
        </div>
      </div>

      <div className="lesson-layout bottom">
        <div className="card inner-card">
          <p className="section-label">Shadowing</p>
          <h3>録音して比較する</h3>
          <button className="primary-button" onClick={toggleRecording}>
            {recordingState === "recording" ? "録音停止" : "録音開始"}
          </button>
          {recordingState === "blocked" && (
            <p className="error-text">マイク権限が必要です。ブラウザで許可してください。</p>
          )}
          {audioSource.url && <audio controls src={audioSource.url} className="audio-player" />}
          {recordedUrl && <audio controls src={recordedUrl} className="audio-player" />}
        </div>

        <div className="card inner-card">
          <p className="section-label">Dictation</p>
          <h3>聞こえた通りに入力</h3>
          <textarea
            value={dictation}
            onChange={(event) => setDictation(event.target.value)}
            placeholder="例: whaddaya doing"
          />
          <div className="dictation-actions">
            <button className="primary-button" onClick={() => setShowResult(true)}>
              答え合わせ
            </button>
          </div>
          {showResult && (
            <div className="result-line">
              {dictationResult.map((item, index) => (
                <span key={`${item.word}-${index}`} className={item.ok ? "ok" : "ng"}>
                  {item.word}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export default function App() {
  const [sourceText, setSourceText] = useState(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved).sourceText ?? DEFAULT_TEXT : DEFAULT_TEXT;
  });
  const [appliedText, setAppliedText] = useState(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved).appliedText ?? DEFAULT_TEXT : DEFAULT_TEXT;
  });
  const [activeIndex, setActiveIndex] = useState(0);
  const [audioBySentence, setAudioBySentence] = useState({});

  const sentences = useMemo(() => splitIntoSentences(appliedText), [appliedText]);
  const draftSentences = useMemo(() => splitIntoSentences(sourceText), [sourceText]);
  const activeSentence = sentences[activeIndex] ?? "";

  useEffect(() => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        sourceText,
        appliedText,
      }),
    );
  }, [sourceText, appliedText]);

  useEffect(() => {
    if (activeIndex > sentences.length - 1) {
      setActiveIndex(Math.max(sentences.length - 1, 0));
    }
  }, [activeIndex, sentences.length]);

  const applySourceText = () => {
    setAppliedText(sourceText);
    setActiveIndex(0);
    setAudioBySentence({});
  };

  return (
    <div className="screen single-page">
      <section className="hero card">
        <p className="eyebrow">HearGap</p>
        <h1>貼り付けた英文を、そのまま聞ける形にする。</h1>
        <p className="hero-copy">
          教材一覧は持たず、英文を貼るだけで 1 文ごとの Sync View と練習フローを作る構成に変えました。
          音声は実ファイルを優先し、ない場合だけ英語TTSを使います。
        </p>
      </section>

      <div className="workspace-grid">
        <div className="workspace-sidebar">
          <EditorCard
            text={sourceText}
            onTextChange={setSourceText}
            onApply={applySourceText}
            sentenceCount={draftSentences.length}
          />
          <SentenceRail sentences={sentences} activeIndex={activeIndex} onSelect={setActiveIndex} />
        </div>

        {activeSentence ? (
          <PracticePanel
            sentence={activeSentence}
            currentIndex={activeIndex}
            totalSentences={sentences.length}
            onPrev={() => setActiveIndex((current) => Math.max(current - 1, 0))}
            onNext={() => setActiveIndex((current) => Math.min(current + 1, sentences.length - 1))}
            audioSource={audioBySentence[activeSentence] ?? {}}
            setAudioSource={(value) =>
              setAudioBySentence((current) => ({
                ...current,
                [activeSentence]: value,
              }))
            }
          />
        ) : (
          <section className="card empty-card">
            <p className="section-label">Ready</p>
            <h2>英文を貼り付けるとここに学習画面が出ます。</h2>
          </section>
        )}
      </div>
    </div>
  );
}
