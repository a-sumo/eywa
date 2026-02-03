import { useVoiceInput } from "../hooks/useVoiceInput";

interface VoiceButtonProps {
  onTranscript: (text: string) => void;
}

export function VoiceButton({ onTranscript }: VoiceButtonProps) {
  const { isListening, isSupported, toggleListening } = useVoiceInput({
    onResult: (transcript) => {
      onTranscript(transcript);
    },
  });

  if (!isSupported) {
    return null;
  }

  return (
    <button
      type="button"
      className={`voice-btn ${isListening ? "listening" : ""}`}
      onClick={toggleListening}
      title={isListening ? "Stop listening" : "Start voice input"}
    >
      {isListening ? "⏹" : "🎤"}
    </button>
  );
}
