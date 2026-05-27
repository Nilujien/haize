import sys

with open(r"C:\Users\julie\.openclaw\workspace\haize\simulation.js", encoding="utf-8") as f:
    content = f.read()

with open(r"C:\Users\julie\.openclaw\workspace\haize\_patch_panel.js", encoding="utf-8") as f:
    new_method = f.read()

marker = "  _updatePanel() {"
idx = content.rfind(marker)
if idx == -1:
    print("NOT FOUND")
    sys.exit(1)

new_content = content[:idx] + new_method
with open(r"C:\Users\julie\.openclaw\workspace\haize\simulation.js", "w", encoding="utf-8") as f:
    f.write(new_content)
print(f"OK - new length: {len(new_content)}")
