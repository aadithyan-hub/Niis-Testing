"""Make the throwaway JWT and payload keys in keys/ if they are missing.

keys/ is git-ignored, so a fresh clone has none. Run by setup.bat with the
niis-api venv's Python (it has `cryptography`).
"""
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

KEYS = Path(__file__).resolve().parent / 'keys'
KEYS.mkdir(exist_ok=True)

for name, bits in (('jwt', 2048), ('payload', 3072)):
    private_path, public_path = KEYS / f'{name}_private.pem', KEYS / f'{name}_public.pem'
    if private_path.exists() and public_path.exists():
        print(f'keys/{name}_*.pem already there')
        continue
    key = rsa.generate_private_key(public_exponent=65537, key_size=bits)
    private_path.write_bytes(key.private_bytes(
        serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))
    public_path.write_bytes(key.public_key().public_bytes(
        serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo))
    print(f'made keys/{name}_private.pem and keys/{name}_public.pem')
