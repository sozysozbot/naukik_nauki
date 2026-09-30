import re
import sys

file_path = r'c:\Users\yasus\Documents\latacet_vivliostyle\jamata\jamata_takan\rule.md'
with open(file_path, 'r', encoding='utf-8') as f:
    text = f.read()

def replacer(match):
    if match.group(1):
        return match.group(1)
    if match.group(2):
        return f'{{{match.group(2)}|○○}}'
    return match.group(0)

pattern = re.compile(r'(\{[^|}]+\|[^}]+\})|([\u4e00-\u9faf\u3005])')
new_text = pattern.sub(replacer, text)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(new_text)

print("Done")