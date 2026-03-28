import { useEffect, useMemo, useRef, useState } from "react";

const LOOP_OPTIONS = [1, 3];
const SPEED_OPTIONS = [1, 0.8, 0.6];
const STORAGE_KEY = "heargap-workspace";
const VOICE_STORAGE_KEY = "heargap-voice-uri";
const TAG_OPTIONS = ["連結", "脱落", "弱形", "flap T", "省略", "強勢"];
const LOOP_GAP_MS = 300;

const DEFAULT_TEXT = `What are you doing?
I didn't get a chance to call you.
A lot of people missed it.`;

const DEFAULT_HELPERS = {
  "What are you doing?": {
    heardAs: "Whaddaya doing?",
    kana: "ワダヤ ドゥーイン",
    translation: "何してるの？",
    notes: "what are がつながって、you が ヤ に弱く聞こえる。",
    tags: ["連結", "弱形", "脱落"],
  },
  "I didn't get a chance to call you.": {
    heardAs: "I din get a chance t'call ya.",
    kana: "アイ ディン ゲラ チャンス タコール ヤ",
    translation: "電話する時間が取れなかった。",
    notes: "didn't の t が落ち、to call が タコール のようにつながる。",
    tags: ["脱落", "連結", "弱形"],
  },
  "A lot of people missed it.": {
    heardAs: "Alotta people misdit.",
    kana: "アロラ ピーポー ミスディッ",
    translation: "多くの人がそれを聞き逃した。",
    notes: "a lot of が アロラ に縮み、missed it の d+i がなめらかにつながる。",
    tags: ["連結", "省略", "flap T"],
  },
};

const emptyHelper = () => ({
  heardAs: "",
  kana: "",
  ipa: "",
  translation: "",
  notes: "",
  tags: [],
  start: "",
  end: "",
});

const AUTO_TRANSLATIONS = {
  what: "何",
  are: "です",
  you: "あなた",
  doing: "している",
  i: "私",
  did: "した",
  didnt: "しなかった",
  get: "得る",
  a: "",
  chance: "機会",
  to: "に",
  call: "電話する",
  lot: "たくさん",
  of: "の",
  people: "人々",
  missed: "聞き逃した",
  it: "それ",
  pork: "豚肉",
  and: "そして",
  theres: "ある",
  some: "いくらかの",
  honey: "はちみつ",
  garlic: "にんにく",
  oh: "ああ",
  yeah: "うん",
  quit: "やめる",
  right: "すぐ",
  now: "今",
};

const KANA_MAP = {
  what: "ワッ",
  are: "アー",
  you: "ユー",
  doing: "ドゥーイン",
  i: "アイ",
  didnt: "ディン",
  get: "ゲッ",
  a: "ァ",
  chance: "チャンス",
  to: "タ",
  call: "コール",
  lot: "ロット",
  of: "ァ",
  people: "ピーポー",
  missed: "ミスト",
  it: "イッ",
  pork: "ポーク",
  and: "ン",
  theres: "ゼアズ",
  some: "サム",
  honey: "ハニー",
  garlic: "ガーリック",
  oh: "オウ",
  yeah: "イェー",
  quit: "クウィッ",
  right: "ライト",
  now: "ナウ",
};

const IPA_MAP = {
  what: "wʌt",
  are: "ɑɚ",
  you: "ju",
  doing: "ˈduːɪŋ",
  didnt: "dɪn",
  get: "ɡɛt",
  chance: "tʃæns",
  call: "kɔl",
  people: "ˈpipəl",
  missed: "mɪst",
  it: "ɪt",
  pork: "pɔrk",
  and: "ən",
  theres: "ðerz",
  some: "səm",
  honey: "ˈhʌni",
  garlic: "ˈɡɑrlɪk",
  oh: "oʊ",
  yeah: "jɛə",
  quit: "kwɪt",
  right: "raɪt",
  now: "naʊ",
};

const PHRASE_RULES = [
  {
    match: ["what", "are", "you"],
    heardAs: "whaddaya",
    kana: "ワダヤ",
    translation: "何してるの",
    tags: ["連結", "弱形", "脱落"],
    note: "what are you が一気につながって聞こえる。",
  },
  {
    match: ["a", "lot", "of"],
    heardAs: "alotta",
    kana: "アロラ",
    translation: "たくさんの",
    tags: ["連結", "弱形"],
    note: "a lot of がまとまって短くなる。",
  },
  {
    match: ["going", "to"],
    heardAs: "gonna",
    kana: "ガナ",
    translation: "するつもり",
    tags: ["連結", "弱形"],
    note: "going to が一塊で聞こえる。",
  },
  {
    match: ["want", "to"],
    heardAs: "wanna",
    kana: "ワナ",
    translation: "したい",
    tags: ["連結", "弱形"],
    note: "want to がワナのように縮む。",
  },
  {
    match: ["got", "to"],
    heardAs: "gotta",
    kana: "ガラ",
    translation: "しなきゃ",
    tags: ["連結", "flap T"],
    note: "got to がガラのように崩れる。",
  },
  {
    match: ["kind", "of"],
    heardAs: "kinda",
    kana: "カインダ",
    translation: "ちょっと",
    tags: ["連結", "弱形"],
    note: "kind of が短く縮む。",
  },
  {
    match: ["out", "of"],
    heardAs: "outta",
    kana: "アウラ",
    translation: "外へ",
    tags: ["連結", "弱形", "flap T"],
    note: "out of がアウラに近く聞こえる。",
  },
  {
    match: ["right", "now"],
    heardAs: "right now",
    kana: "ライナウ",
    ipa: "raɪt naʊ",
    translation: "今すぐ",
    tags: ["連結"],
    note: "right now が切れずに流れて聞こえる。",
  },
  {
    match: ["there", "is"],
    heardAs: "there's",
    kana: "ゼアズ",
    translation: "ある",
    tags: ["連結", "弱形"],
    note: "there is が there's に縮む。",
  },
];

const normalizeWord = (word) => word.toLowerCase().replace(/[^a-z']/g, "").replace(/'/g, "");

const fallbackKana = (word) =>
  word
    .toLowerCase()
    .replace(/tion/g, "ション")
    .replace(/ight/g, "アイト")
    .replace(/ow/g, "オウ")
    .replace(/ar/g, "アー")
    .replace(/or/g, "オー")
    .replace(/qu/g, "ク")
    .replace(/th/g, "ズ")
    .replace(/sh/g, "シュ")
    .replace(/ch/g, "チ")
    .replace(/ph/g, "フ")
    .replace(/ee/g, "イー")
    .replace(/oo/g, "ウー")
    .replace(/ou/g, "アウ")
    .replace(/au/g, "オー")
    .replace(/a/g, "ア")
    .replace(/e/g, "エ")
    .replace(/i/g, "イ")
    .replace(/o/g, "オ")
    .replace(/u/g, "ウ")
    .replace(/b/g, "ブ")
    .replace(/c/g, "ク")
    .replace(/d/g, "ド")
    .replace(/f/g, "フ")
    .replace(/g/g, "グ")
    .replace(/h/g, "ハ")
    .replace(/j/g, "ジ")
    .replace(/k/g, "ク")
    .replace(/l/g, "ル")
    .replace(/m/g, "ム")
    .replace(/n/g, "ン")
    .replace(/p/g, "プ")
    .replace(/q/g, "ク")
    .replace(/r/g, "ル")
    .replace(/s/g, "ス")
    .replace(/t/g, "ト")
    .replace(/v/g, "ヴ")
    .replace(/w/g, "ウ")
    .replace(/x/g, "クス")
    .replace(/y/g, "イ")
    .replace(/z/g, "ズ");

const fallbackIpa = (word) =>
  word
    .toLowerCase()
    .replace(/tion/g, "ʃən")
    .replace(/igh/g, "aɪ")
    .replace(/ow/g, "aʊ")
    .replace(/qu/g, "kw")
    .replace(/th/g, "θ")
    .replace(/sh/g, "ʃ")
    .replace(/ch/g, "tʃ")
    .replace(/ph/g, "f")
    .replace(/ee/g, "iː")
    .replace(/oo/g, "uː")
    .replace(/ou/g, "aʊ")
    .replace(/a/g, "æ")
    .replace(/e/g, "e")
    .replace(/i/g, "ɪ")
    .replace(/o/g, "ɑ")
    .replace(/u/g, "ʌ");

const normalizeInputText = (text) =>
  text
    .replace(/\r\n/g, "\n")
    .replace(/([a-zA-Z])([,!?;:])([a-zA-Z])/g, "$1 $2 $3")
    .replace(/\s+/g, " ")
    .trim();

const tokenizeForHelper = (text) =>
  normalizeInputText(text)
    .replace(/[^a-zA-Z0-9'\s]/g, " ")
    .split(/\s+/)
    .map(normalizeWord)
    .filter(Boolean);

const buildAutoHelper = (sentence) => {
  if (DEFAULT_HELPERS[sentence]) {
    return DEFAULT_HELPERS[sentence];
  }

  const normalized = tokenizeForHelper(sentence);
  const lowerSentence = normalizeInputText(sentence).toLowerCase();
  const tags = [];
  const notes = [];
  const heardTokens = [];
  const kanaTokens = [];
  const ipaTokens = [];
  const translationTokens = [];

  for (let index = 0; index < normalized.length; ) {
    const phraseRule = PHRASE_RULES.find((rule) =>
      rule.match.every((word, offset) => normalized[index + offset] === word),
    );

    if (phraseRule) {
      heardTokens.push(phraseRule.heardAs);
      kanaTokens.push(phraseRule.kana);
      if (phraseRule.ipa) {
        ipaTokens.push(phraseRule.ipa);
      }
      if (phraseRule.translation) {
        translationTokens.push(phraseRule.translation);
      }
      tags.push(...phraseRule.tags);
      notes.push(phraseRule.note);
      index += phraseRule.match.length;
      continue;
    }

    const word = normalized[index];
    let heardWord = word;
    let kanaWord = KANA_MAP[word] ?? fallbackKana(word);
    let ipaWord = IPA_MAP[word] ?? fallbackIpa(word);

    if (word === "didnt") {
      heardWord = "din";
      kanaWord = "ディン";
      ipaWord = "dɪn";
      tags.push("脱落");
      notes.push("didn't の t が落ちやすい。");
    } else if (word === "you") {
      heardWord = "ya";
      kanaWord = "ヤ";
      ipaWord = "jə";
      tags.push("弱形");
      notes.push("you が弱く ヤ に近づく。");
    } else if (word === "and") {
      heardWord = "n";
      kanaWord = "ン";
      ipaWord = "ən";
      tags.push("弱形");
      notes.push("and が短く弱くなる。");
    } else if (word === "to") {
      heardWord = "tə";
      kanaWord = "タ";
      ipaWord = "tə";
      tags.push("弱形");
      notes.push("to が弱く曖昧母音になる。");
    } else if (word === "of") {
      heardWord = "əv";
      kanaWord = "ァヴ";
      ipaWord = "əv";
      tags.push("弱形");
      notes.push("of が弱く短くなる。");
    }

    heardTokens.push(heardWord);
    kanaTokens.push(kanaWord);
    ipaTokens.push(ipaWord);
    const translation = AUTO_TRANSLATIONS[word];
    if (translation) {
      translationTokens.push(translation);
    }
    index += 1;
  }

  if (/\b[a-z]+t [aeiou]/i.test(lowerSentence) || /\b(it|right)\b/i.test(lowerSentence)) {
    tags.push("flap T");
    notes.push("t/d が軽く弾かれて聞こえる可能性がある。");
  }

  const heardAs = heardTokens.join(" ").replace(/\s+([?.!,])/g, "$1");
  const kana = kanaTokens.join(" ");
  const ipa = ipaTokens.join(" ");
  const translation = translationTokens.join(" ").trim();

  return {
    heardAs,
    kana,
    ipa,
    translation: translation || "日本語メモを追加",
    notes: notes.join(" "),
    tags: [...new Set(tags)],
  };
};

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
    .filter(
      (voice) =>
        voice.lang?.toLowerCase().startsWith("en") || /english|google|microsoft/i.test(voice.name),
    )
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

function EditorCard({ text, onTextChange, onApply, sentenceCount, audioUrl, onAudioUrlChange }) {
  return (
    <section className="card compact-card source-card">
      <p className="section-label">Source Text</p>
      <h2>英文を貼り付けて Sync View を作る</h2>
      <p className="muted">
        改行か句読点で文分割します。貼り付けた英文に対して、1文ずつ音の補助情報を付けられます。
      </p>
      <textarea
        className="source-textarea"
        value={text}
        onChange={(event) => onTextChange(event.target.value)}
        placeholder="What are you doing?"
      />
      <div className="source-meta-grid">
        <div>
          <p className="control-label">Audio URL</p>
          <input
            className="text-input"
            value={audioUrl}
            onChange={(event) => onAudioUrlChange(event.target.value)}
            placeholder="https://example.com/sample.mp3"
          />
        </div>
        <div className="source-meta-hint">
          <p className="muted">
            元音声があれば `start / end` で1文だけ区間再生します。未設定時だけ英語TTSにフォールバックします。
          </p>
        </div>
      </div>
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
    <section className="card compact-card">
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

function HelperEditor({ helper, onChange }) {
  const toggleTag = (tag) => {
    const nextTags = helper.tags.includes(tag)
      ? helper.tags.filter((item) => item !== tag)
      : [...helper.tags, tag];

    onChange({ ...helper, tags: nextTags });
  };

  return (
    <div className="helper-editor">
      <div className="helper-grid">
        <div>
          <p className="control-label">実際の音</p>
          <input
            className="text-input"
            value={helper.heardAs}
            onChange={(event) => onChange({ ...helper, heardAs: event.target.value })}
            placeholder="Whaddaya doing?"
          />
        </div>
        <div>
          <p className="control-label">カタカナ</p>
          <input
            className="text-input"
            value={helper.kana}
            onChange={(event) => onChange({ ...helper, kana: event.target.value })}
            placeholder="ワダヤ ドゥーイン"
          />
        </div>
        <div>
          <p className="control-label">IPA</p>
          <input
            className="text-input"
            value={helper.ipa ?? ""}
            onChange={(event) => onChange({ ...helper, ipa: event.target.value })}
            placeholder="oʊ jɛə kwɪt raɪt naʊ"
          />
        </div>
        <div>
          <p className="control-label">Start</p>
          <input
            className="text-input"
            value={helper.start ?? ""}
            onChange={(event) => onChange({ ...helper, start: event.target.value })}
            placeholder="12.4"
            inputMode="decimal"
          />
        </div>
        <div>
          <p className="control-label">End</p>
          <input
            className="text-input"
            value={helper.end ?? ""}
            onChange={(event) => onChange({ ...helper, end: event.target.value })}
            placeholder="14.1"
            inputMode="decimal"
          />
        </div>
        <div>
          <p className="control-label">日本語</p>
          <input
            className="text-input"
            value={helper.translation}
            onChange={(event) => onChange({ ...helper, translation: event.target.value })}
            placeholder="何してるの？"
          />
        </div>
        <div>
          <p className="control-label">音変化メモ</p>
          <input
            className="text-input"
            value={helper.notes}
            onChange={(event) => onChange({ ...helper, notes: event.target.value })}
            placeholder="what are がつながる"
          />
        </div>
      </div>

      <div>
        <p className="control-label">音変化タグ</p>
        <div className="option-row">
          {TAG_OPTIONS.map((tag) => (
            <button
              key={tag}
              className={helper.tags.includes(tag) ? "option active" : "option"}
              onClick={() => toggleTag(tag)}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function PracticePanel({
  sentence,
  helper,
  onHelperChange,
  onAutoFill,
  currentIndex,
  totalSentences,
  onPrev,
  onNext,
  audioUrl,
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
  const [helperOpen, setHelperOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timeoutRef = useRef([]);
  const streamRef = useRef(null);
  const audioRef = useRef(null);
  const audioContextRef = useRef(null);
  const gainNodeRef = useRef(null);

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
      audioContextRef.current?.close?.();
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

  const stopPlayback = () => {
    window.speechSynthesis.cancel();
    timeoutRef.current.forEach((id) => window.clearTimeout(id));
    timeoutRef.current = [];
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setIsPlaying(false);
    setHighlightIndex(-1);
  };

  const ensureAudioEnhancer = (audio) => {
    if (typeof window === "undefined" || !window.AudioContext) {
      return;
    }

    const context = audioContextRef.current ?? new window.AudioContext();
    audioContextRef.current = context;
    gainNodeRef.current = gainNodeRef.current ?? context.createGain();
    gainNodeRef.current.gain.value = 1.1;

    const source = context.createMediaElementSource(audio);
    source.connect(gainNodeRef.current);
    gainNodeRef.current.connect(context.destination);
    context.resume?.();
  };

  const runSegmentPlayback = () => {
    const start = Number.parseFloat(helper.start);
    const end = Number.parseFloat(helper.end);

    if (!audioUrl || Number.isNaN(start) || Number.isNaN(end) || end <= start) {
      return false;
    }

    timeoutRef.current.forEach((id) => window.clearTimeout(id));
    timeoutRef.current = [];

    const audio = new Audio(audioUrl);
    audioRef.current = audio;
    ensureAudioEnhancer(audio);
    setIsPlaying(true);

    const segmentDurationMs = ((end - start) * 1000) / speed;
    scheduleHighlights(segmentDurationMs, LOOP_GAP_MS);

    let playedCount = 0;

    const playOnce = () => {
      audio.currentTime = start;
      audio.playbackRate = speed;
      audio.play().catch(() => {
        setIsPlaying(false);
        setHighlightIndex(-1);
      });

      const pauseId = window.setTimeout(() => {
        audio.pause();
        playedCount += 1;

        if (playedCount < loopCount) {
          const nextId = window.setTimeout(playOnce, LOOP_GAP_MS);
          timeoutRef.current.push(nextId);
          return;
        }

        setIsPlaying(false);
        setHighlightIndex(-1);
      }, segmentDurationMs);

      timeoutRef.current.push(pauseId);
    };

    playOnce();
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
    stopPlayback();
    if (runSegmentPlayback()) {
      return;
    }
    runTtsPlayback();
  };

  const handleVoiceChange = (event) => {
    const voiceURI = event.target.value;
    window.localStorage.setItem(VOICE_STORAGE_KEY, voiceURI);
    setEnglishVoice(englishVoices.find((voice) => voice.voiceURI === voiceURI) ?? null);
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

  const handlePrev = () => {
    stopPlayback();
    onPrev();
  };

  const handleNext = () => {
    stopPlayback();
    onNext();
  };

  return (
    <section className="card practice-card">
      <div className="lesson-top">
        <div>
          <p className="section-label">Lesson</p>
          <h2>
            {currentIndex + 1} / {totalSentences}
          </h2>
        </div>
        <div className="lesson-nav">
          <button className="ghost-button" onClick={handlePrev} disabled={currentIndex === 0}>
            前へ
          </button>
          <button className="ghost-button" onClick={handleNext} disabled={currentIndex === totalSentences - 1}>
            次へ
          </button>
          <button className="primary-button" onClick={runPlayback}>
            {isPlaying ? "再生中" : "再生する"}
          </button>
        </div>
      </div>

      <p className="playback-state">{isPlaying ? "再生中" : "待機中"}</p>

      <div className="player-bar">
        {words.map((word, index) => (
          <span key={`${word}-${index}`} className={index === highlightIndex ? "word active" : "word"}>
            {word}
          </span>
        ))}
      </div>

      <div className="sync-panel">
        <p className="section-label">Sync View</p>
        {helper.heardAs && helper.heardAs.trim().toLowerCase() !== sentence.trim().toLowerCase() ? (
          <p className="heard-as">{helper.heardAs}</p>
        ) : null}
        {helper.kana ? <p className="kana-line">{helper.kana}</p> : null}
        {helper.ipa ? <p className="ipa-line">{helper.ipa}</p> : null}
        {helper.translation ? <p className="translation">{helper.translation}</p> : null}
        {helper.tags.length ? (
          <div className="tag-list">
            {helper.tags.map((tag) => (
              <span key={tag} className="chip">
                {tag}
              </span>
            ))}
          </div>
        ) : null}
        {helper.notes ? <p className="helper-notes">{helper.notes}</p> : null}
      </div>

      <div className="control-grid compact-controls">
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
      </div>

      <details className="mobile-panel helper-panel" open={helperOpen} onToggle={(event) => setHelperOpen(event.currentTarget.open)}>
        <summary className="panel-summary">
          <span>補助情報を編集</span>
          <span>{helperOpen ? "閉じる" : "開く"}</span>
        </summary>
        <section className="helper-card helper-card-open">
          <div className="editor-actions helper-actions">
            <button className="ghost-button" onClick={onAutoFill}>
              自動補助を再生成
            </button>
          </div>
          <HelperEditor helper={helper} onChange={onHelperChange} />
        </section>
      </details>

      <details className="mobile-panel tools-panel" open={toolsOpen} onToggle={(event) => setToolsOpen(event.currentTarget.open)}>
        <summary className="panel-summary">
          <span>録音とディクテーション</span>
          <span>{toolsOpen ? "閉じる" : "開く"}</span>
        </summary>
        <div className="lesson-layout bottom compact-tools">
          <div className="card inner-card">
            <p className="section-label">Shadowing</p>
            <h3>録音して比較する</h3>
            <button className="primary-button" onClick={toggleRecording}>
              {recordingState === "recording" ? "録音停止" : "録音開始"}
            </button>
            {recordingState === "blocked" ? (
              <p className="error-text">マイク権限が必要です。ブラウザで許可してください。</p>
            ) : null}
            {recordedUrl ? <audio controls src={recordedUrl} className="audio-player" /> : null}
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
            {showResult ? (
              <div className="result-line">
                {dictationResult.map((item, index) => (
                  <span key={`${item.word}-${index}`} className={item.ok ? "ok" : "ng"}>
                    {item.word}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </details>
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
  const [helpersBySentence, setHelpersBySentence] = useState(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved).helpersBySentence ?? DEFAULT_HELPERS : DEFAULT_HELPERS;
  });
  const [audioUrl, setAudioUrl] = useState(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved).audioUrl ?? "" : "";
  });
  const [activeIndex, setActiveIndex] = useState(0);

  const sentences = useMemo(() => splitIntoSentences(appliedText), [appliedText]);
  const draftSentences = useMemo(() => splitIntoSentences(sourceText), [sourceText]);
  const activeSentence = sentences[activeIndex] ?? "";
  const activeHelper = helpersBySentence[activeSentence] ?? buildAutoHelper(activeSentence);

  useEffect(() => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        sourceText,
        appliedText,
        helpersBySentence,
        audioUrl,
      }),
    );
  }, [sourceText, appliedText, helpersBySentence, audioUrl]);

  useEffect(() => {
    if (activeIndex > sentences.length - 1) {
      setActiveIndex(Math.max(sentences.length - 1, 0));
    }
  }, [activeIndex, sentences.length]);

  const applySourceText = () => {
    const nextSentences = splitIntoSentences(sourceText);
    setAppliedText(sourceText);
    setActiveIndex(0);
    setHelpersBySentence((current) => {
      const nextHelpers = {};
      nextSentences.forEach((sentence) => {
        nextHelpers[sentence] = current[sentence] ?? buildAutoHelper(sentence);
      });
      return nextHelpers;
    });
  };

  const updateActiveHelper = (value) => {
    setHelpersBySentence((current) => ({
      ...current,
      [activeSentence]: value,
    }));
  };

  return (
    <div className="screen single-page">
      <section className="hero card">
        <p className="eyebrow">HearGap</p>
        <h1>貼り付けた英文に、音の補助レイヤーを付ける。</h1>
        <p className="hero-copy">
          1文ごとに「実際の音」「カタカナ」「日本語」「音変化タグ」「脱落メモ」を持たせて、
          単なる英文表示ではなく、聞こえ方の差まで見える Sync View にします。
        </p>
      </section>

      <div className="workspace-grid">
        <div className="workspace-sidebar">
          <EditorCard
            text={sourceText}
            onTextChange={setSourceText}
            onApply={applySourceText}
            sentenceCount={draftSentences.length}
            audioUrl={audioUrl}
            onAudioUrlChange={setAudioUrl}
          />
          <SentenceRail sentences={sentences} activeIndex={activeIndex} onSelect={setActiveIndex} />
        </div>

        {activeSentence ? (
          <PracticePanel
            sentence={activeSentence}
            helper={activeHelper}
            onHelperChange={updateActiveHelper}
            onAutoFill={() => updateActiveHelper(buildAutoHelper(activeSentence))}
            currentIndex={activeIndex}
            totalSentences={sentences.length}
            onPrev={() => setActiveIndex((current) => Math.max(current - 1, 0))}
            onNext={() => setActiveIndex((current) => Math.min(current + 1, sentences.length - 1))}
            audioUrl={audioUrl}
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
