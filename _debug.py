with open(r"C:\Users\julie\.openclaw\workspace\haize\simulation.js", encoding="utf-8") as f:
    content = f.read()

# Find the broken strokeStyle
idx = content.find("gba(255,215,0,")
print(f"Found at idx={idx}")
print(repr(content[idx-30:idx+60]))

# Check line 1948 (0-indexed: 1947)
lines = content.split('\n')
print(f"\nLine 1947: {repr(lines[1947])}")
print(f"Line 1946: {repr(lines[1946])}")
