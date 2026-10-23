from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
root = Path(__file__).parent
files = ['assets/pets/hoodie.webp','assets/pets/glasses.webp'] + ['assets/pets/cat.webp', 'assets/pets/dog.webp', 'assets/pets/rabbit.webp', 'assets/pets/redpanda.webp', 'pet-studio.js'] + ['index.html', 'script.js', 'companion.js', 'share.js', 'bootstrap.js', 'social.js', 'together.js', 'sync.js', 'daily.js', 'style.css', 'sw.js', 'manifest.json', 'icon.svg', 'privacy.html', 'open-pet.html', 'icons/icon-192.png', 'icons/icon-512.png']
output = root / 'release'
output.mkdir(exist_ok=True)
with ZipFile(output / 'suixin-web.zip', 'w', ZIP_DEFLATED) as archive:
    for name in files:
        archive.write(root / name, name)
print(output / 'suixin-web.zip')
with ZipFile(output / 'suixin-server.zip', 'w', ZIP_DEFLATED) as archive:
    for name in files + ['server.py', 'features.py', 'experience.py', 'pet_studio.py', 'deploy.py', 'render.yaml', 'DEPLOY.md', 'SERVER.md', 'PET-STUDIO.md']:
        archive.write(root / name, name)
print(output / 'suixin-server.zip')
