"""Speaker-echo detection for voice input transcriptions."""

from voice_echo_guard import (
    looks_like_acoustic_echo,
    looks_like_echo_of_any,
    looks_like_echo_of_prior_assistant,
    looks_like_speaker_echo,
)


def test_substring_of_assistant_is_echo():
    assistant = (
        "Désolé, je n'ai pas pu lancer votre briefing car aucune routine "
        "de démarrage n'est enregistrée."
    )
    user = "je n'ai pas pu lancer votre briefing"
    assert looks_like_speaker_echo(user, assistant) is True


def test_partial_tail_fragment_is_echo():
    assistant = (
        "actualité, météo, calendrier, email, je peux l'enregistrer pour les prochaines fois."
    )
    user = "actualité, météo, calendrier, email"
    assert looks_like_speaker_echo(user, assistant) is True


def test_unrelated_user_speech_is_not_echo():
    assistant = "Bonsoir. Je ne peux pas lancer le briefing sans routine."
    user = "Oui configure la météo à Paris s'il te plaît"
    assert looks_like_speaker_echo(user, assistant) is False


def test_bourbon_request_not_echo_of_prior_calendar_reply() -> None:
    """Regression: shared ``pour demain pour`` must not drop a new user request."""
    user = "pour demain, pour que j'aille acheter du bourbo"
    prior = "Je l'ai ajouté à votre calendrier pour demain à midi pour une heure."
    assert looks_like_speaker_echo(user, prior) is False
    assert looks_like_echo_of_prior_assistant(user, prior) is False


def test_acoustic_echo_substring_still_detected() -> None:
    assistant = (
        "Désolé, je n'ai pas pu lancer votre briefing car aucune routine "
        "de démarrage n'est enregistrée."
    )
    user = "je n'ai pas pu lancer votre briefing"
    assert looks_like_acoustic_echo(user, assistant) is True
    assert looks_like_echo_of_prior_assistant(user, assistant) is True


def test_echo_of_any_checks_multiple_candidates():
    assert looks_like_echo_of_any(
        "qu'une routine de démarrage",
        "",
        "aucune routine de démarrage n'est enregistrée",
    )
