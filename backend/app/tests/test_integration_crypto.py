from app.integrations.crypto import decrypt_secret, encrypt_secret


def test_encrypt_decrypt_roundtrip():
    token = encrypt_secret("pk_clickup_secret_123")
    assert token != "pk_clickup_secret_123"       # actually encrypted
    assert decrypt_secret(token) == "pk_clickup_secret_123"


def test_encrypt_is_nondeterministic():
    assert encrypt_secret("same") != encrypt_secret("same")  # Fernet uses a random IV
