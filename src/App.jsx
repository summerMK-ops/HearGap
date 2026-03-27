import { useEffect, useMemo, useRef, useState } from "react";
import { lessonLibrary } from "./data";

const LOOP_OPTIONS = [1, 3];
const SPEED_OPTIONS = [1, 0.8, 0.6];
const STORAGE_KEY = "heargap-mvp-state";

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

function HomeScreen({ lessons, onStart, stats }) {
  const tagSummary = Object.entries(stats.tagWeakness).sort((a, b) => b[1] - a[1]);

  return (
    <div className="screen">
      <section className="hero card">
        <p className="eyebrow">HearGap</p>
        <h1>知っている英語を、聞こえる英語に変える。</h1>
        <p className="hero-copy">
          単語知識ではなく、実際の音の崩れ方に慣れるための英語リスニングMVPです。
          文字と音のズレを見える化して、1文ずつ詰めます。
        </p>
        <div className="hero-points">
          <span>音声 + 英文 + 日本語の同期</span>
          <span>実音表示と音変化タグ</span>
          <span>ループ・録音・ディクテーション</span>
        </div>
      </section>

      <section className="dashboard-grid">
        <div className="card">
          <p className="section-label">今日の練習</p>
          <h2>{stats.completedSentences}文クリア</h2>
          <p>聞こえなかった箇所を残しながら、1文フローを固定して反復します。</p>
        </div>
        <div className="card">
          <p className="section-label">苦手な音変化</p>
          <div className="tag-list">
            {tagSummary.length ? (
              tagSummary.slice(0, 4).map(([tag, count]) => (
                <span key={tag} className="chip warning">
                  {tag} {count}
                </span>
              ))
            ) : (
              <span className="muted">まだ分析データはありません</span>
            )}
          </div>
        </div>
      </section>

      <section className="lesson-list">
        {lessons.map((lesson) => (
          <article key={lesson.id} className="card lesson-card">
            <div>
              <p className="section-label">{lesson.level}</p>
              <h3>{lesson.title}</h3>
              <p>{lesson.description}</p>
            </div>
            <div className="lesson-meta">
              <span>{lesson.sentences.length} sentences</span>
              <button className="primary-button" onClick={() => onStart(lesson.id)}>
                学習を始める
              </button>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}

function LessonScreen({
  lesson,
  sentenceIndex,
  onBack,
  onComplete,
  progress,
  setProgress,
}) {
  const sentence = lesson.sentences[sentenceIndex];
  const words = useMemo(() => sentence.english.split(" "), [sentence.english]);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loopCount, setLoopCount] = useState(1);
  const [speed, setSpeed] = useState(1);
  const [dictation, setDictation] = useState(progress.dictation ?? "");
  const [showResult, setShowResult] = useState(Boolean(progress.dictationChecked));
  const [recordingState, setRecordingState] = useState("idle");
  const [recordedUrl, setRecordedUrl] = useState(progress.recordedUrl ?? "");
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timeoutRef = useRef([]);
  const streamRef = useRef(null);

  useEffect(() => {
    setDictation(progress.dictation ?? "");
    setShowResult(Boolean(progress.dictationChecked));
    setRecordedUrl(progress.recordedUrl ?? "");
    setHighlightIndex(-1);
    setIsPlaying(false);
    return () => {
      window.speechSynthesis.cancel();
      timeoutRef.current.forEach((id) => window.clearTimeout(id));
      timeoutRef.current = [];
    };
  }, [sentence.id, progress.dictation, progress.dictationChecked, progress.recordedUrl]);

  const dictationResult = useMemo(
    () => compareDictation(dictation, sentence.english),
    [dictation, sentence.english],
  );

  const runPlayback = () => {
    window.speechSynthesis.cancel();
    timeoutRef.current.forEach((id) => window.clearTimeout(id));
    timeoutRef.current = [];
    setIsPlaying(true);

    const totalWords = words.length;
    const baseDuration = Math.max(2200, sentence.english.length * 90);
    const sentenceDuration = baseDuration / speed;

    for (let loop = 0; loop < loopCount; loop += 1) {
      const utterance = new SpeechSynthesisUtterance(sentence.english);
      utterance.lang = "en-US";
      utterance.rate = speed;
      utterance.pitch = 1;

      utterance.onend = () => {
        if (loop === loopCount - 1) {
          const endingId = window.setTimeout(() => {
            setIsPlaying(false);
            setHighlightIndex(-1);
          }, 250);
          timeoutRef.current.push(endingId);
        }
      };

      const startOffset = loop * (sentenceDuration + 500);
      const speakId = window.setTimeout(() => window.speechSynthesis.speak(utterance), startOffset);
      timeoutRef.current.push(speakId);

      words.forEach((_, index) => {
        const wordOffset = startOffset + (sentenceDuration / totalWords) * index;
        const highlightId = window.setTimeout(() => setHighlightIndex(index), wordOffset);
        timeoutRef.current.push(highlightId);
      });
    }
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
        setProgress({
          ...progress,
          recordedUrl: url,
        });
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecordingState("recording");
    } catch (error) {
      setRecordingState("blocked");
    }
  };

  const submitDictation = () => {
    setShowResult(true);
    setProgress({
      ...progress,
      dictation,
      dictationChecked: true,
      mistakes: dictationResult.filter((item) => !item.ok).length,
      tags: sentence.tags,
    });
  };

  const finishSentence = () => {
    const mistakes = showResult
      ? dictationResult.filter((item) => !item.ok).length
      : tokenize(sentence.english).length;

    onComplete({
      sentenceId: sentence.id,
      sentence,
      mistakes,
      dictation,
      recordedUrl,
    });
  };

  return (
    <div className="screen">
      <button className="ghost-button" onClick={onBack}>
        ← 教材一覧へ
      </button>

      <section className="card progress-card">
        <div>
          <p className="section-label">
            {lesson.title} / {sentenceIndex + 1} of {lesson.sentences.length}
          </p>
          <h2>1文フロー</h2>
        </div>
        <ol className="flow-list">
          <li>まず音だけ聞く</li>
          <li>聞こえた内容を予想する</li>
          <li>英文を見る</li>
          <li>実際の音の形を見る</li>
          <li>もう一回聞く</li>
          <li>シャドーイングする</li>
          <li>ディクテーションする</li>
          <li>復習保存</li>
        </ol>
      </section>

      <section className="lesson-layout">
        <div className="card player-card">
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
              <span
                key={`${word}-${index}`}
                className={index === highlightIndex ? "word active" : "word"}
              >
                {word}
              </span>
            ))}
          </div>

          <div className="control-group">
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
          </div>
        </div>

        <div className="card transcript-card">
          <p className="section-label">Sync View</p>
          <h3>{sentence.english}</h3>
          <p className="heard-as">{sentence.heardAs}</p>
          <p className="kana-line">{sentence.kana}</p>
          <p className="translation">{sentence.japanese}</p>
          <div className="tag-list">
            {sentence.tags.map((tag) => (
              <span key={tag} className="chip">
                {tag}
              </span>
            ))}
          </div>
          <div className="breakdown-list">
            {sentence.breakdown.map((item) => (
              <div key={item.from} className="breakdown-item">
                <span>{item.from}</span>
                <strong>{item.to}</strong>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="lesson-layout bottom">
        <div className="card">
          <p className="section-label">Shadowing</p>
          <h3>録音して比較する</h3>
          <p className="muted">
            最初はAI採点なし。元音声を再生したあと、自分の音声を残して聞き比べます。
          </p>
          <button className="primary-button" onClick={toggleRecording}>
            {recordingState === "recording" ? "録音停止" : "録音開始"}
          </button>
          {recordingState === "blocked" && (
            <p className="error-text">マイク権限が必要です。ブラウザで許可してください。</p>
          )}
          {recordedUrl && <audio controls src={recordedUrl} className="audio-player" />}
        </div>

        <div className="card">
          <p className="section-label">Dictation</p>
          <h3>聞こえた通りに入力</h3>
          <textarea
            value={dictation}
            onChange={(event) => setDictation(event.target.value)}
            placeholder="例: whaddaya doing"
          />
          <div className="dictation-actions">
            <button className="primary-button" onClick={submitDictation}>
              答え合わせ
            </button>
            <button className="ghost-button" onClick={finishSentence}>
              復習に保存して次へ
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
      </section>
    </div>
  );
}

function ResultScreen({ results, onRestart, onOpenLesson }) {
  const weakMap = results.reduce((acc, item) => {
    item.sentence.tags.forEach((tag) => {
      acc[tag] = (acc[tag] ?? 0) + (item.mistakes > 0 ? 1 : 0);
    });
    return acc;
  }, {});

  const weakTags = Object.entries(weakMap).sort((a, b) => b[1] - a[1]);

  return (
    <div className="screen">
      <section className="card hero">
        <p className="eyebrow">Review</p>
        <h1>聞き取れなかった箇所を復習キューへ。</h1>
        <p className="hero-copy">
          間違えた文と音変化タグをそのまま残して、次回は弱い崩れ方だけ集中的に回せます。
        </p>
      </section>

      <section className="dashboard-grid">
        <div className="card">
          <p className="section-label">最近の復習</p>
          <h2>{results.filter((item) => item.mistakes > 0).length}文</h2>
          <p>聞こえない文をそのまま復習対象にしています。</p>
        </div>
        <div className="card">
          <p className="section-label">苦手な音変化</p>
          <div className="tag-list">
            {weakTags.map(([tag, count]) => (
              <span key={tag} className="chip warning">
                {tag} {count}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="card">
        <p className="section-label">復習登録</p>
        <div className="review-list">
          {results.map((item) => (
            <article key={item.sentenceId} className="review-item">
              <div>
                <h3>{item.sentence.english}</h3>
                <p>{item.sentence.heardAs}</p>
              </div>
              <div className="review-meta">
                <span className={item.mistakes > 0 ? "badge danger" : "badge"}>
                  {item.mistakes > 0 ? `${item.mistakes}箇所ミス` : "クリア"}
                </span>
                <div className="tag-list">
                  {item.sentence.tags.map((tag) => (
                    <span key={tag} className="chip">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="cta-row">
        <button className="ghost-button" onClick={onOpenLesson}>
          教材一覧へ
        </button>
        <button className="primary-button" onClick={onRestart}>
          もう一度このレッスンをやる
        </button>
      </section>
    </div>
  );
}

export default function App() {
  const [screen, setScreen] = useState("home");
  const [activeLessonId, setActiveLessonId] = useState(null);
  const [sentenceIndex, setSentenceIndex] = useState(0);
  const [sentenceProgress, setSentenceProgress] = useState(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved).sentenceProgress ?? {} : {};
  });
  const [results, setResults] = useState(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved).results ?? [] : [];
  });

  const activeLesson = lessonLibrary.find((lesson) => lesson.id === activeLessonId) ?? lessonLibrary[0];

  useEffect(() => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        sentenceProgress,
        results,
      }),
    );
  }, [results, sentenceProgress]);

  const stats = useMemo(() => {
    const tagWeakness = results.reduce((acc, item) => {
      if (item.mistakes > 0) {
        item.sentence.tags.forEach((tag) => {
          acc[tag] = (acc[tag] ?? 0) + 1;
        });
      }
      return acc;
    }, {});

    return {
      completedSentences: results.length,
      tagWeakness,
    };
  }, [results]);

  const startLesson = (lessonId) => {
    setActiveLessonId(lessonId);
    setSentenceIndex(0);
    setSentenceProgress({});
    setResults([]);
    setScreen("lesson");
  };

  const handleCompleteSentence = (result) => {
    const nextResults = [...results.filter((item) => item.sentenceId !== result.sentenceId), result];
    setResults(nextResults);

    if (sentenceIndex + 1 < activeLesson.sentences.length) {
      setSentenceIndex(sentenceIndex + 1);
      return;
    }

    setScreen("result");
  };

  if (screen === "lesson") {
    const sentenceId = activeLesson.sentences[sentenceIndex].id;

    return (
      <LessonScreen
        lesson={activeLesson}
        sentenceIndex={sentenceIndex}
        onBack={() => setScreen("home")}
        onComplete={handleCompleteSentence}
        progress={sentenceProgress[sentenceId] ?? {}}
        setProgress={(value) =>
          setSentenceProgress((current) => ({
            ...current,
            [sentenceId]: value,
          }))
        }
      />
    );
  }

  if (screen === "result") {
    return (
      <ResultScreen
        results={results}
        onOpenLesson={() => setScreen("home")}
        onRestart={() => startLesson(activeLesson.id)}
      />
    );
  }

  return <HomeScreen lessons={lessonLibrary} onStart={startLesson} stats={stats} />;
}
