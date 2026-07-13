from voice_transcript_quality import (
    is_junk_voice_transcription,
    is_voice_transcript_noise_placeholder,
    normalize_voice_transcript_text,
)


def test_noise_tag_is_junk():
    assert is_junk_voice_transcription("<noise>") is True
    assert is_junk_voice_transcription(" Also,") is True


def test_short_partial_is_not_noise_while_streaming():
    assert is_voice_transcript_noise_placeholder("Peux-tu") is False
    assert is_voice_transcript_noise_placeholder("<noise>") is True


def test_short_ack_is_kept():
    assert is_junk_voice_transcription(" Sure.") is False


def test_time_answer_is_not_junk():
    assert is_junk_voice_transcription("midi") is False
    assert is_junk_voice_transcription("à midi") is False
    assert is_junk_voice_transcription("15h") is False
    assert is_junk_voice_transcription("une heure") is False


def test_normalize_trims_live_stt_spacing():
    assert normalize_voice_transcript_text("  hello   world ") == "hello world"
