with open(r"C:\Users\julie\.openclaw\workspace\haize\simulation.js", encoding="utf-8") as f:
    content = f.read()

# Fix: "ctx.strokeStyle = \ngba(...)" -> "ctx.strokeStyle = `rgba(...)`;"
# The backtick before rgba was lost, and the 'r' was consumed as line continuation

# Fix recruit links rgba
old1 = "ctx.strokeStyle = \ngba(255,215,0,${alpha.toFixed(3)});"
new1 = "ctx.strokeStyle = `rgba(255,215,0,${alpha.toFixed(3)})`;"
content = content.replace(old1, new1)

# Fix rancor links rgba
old2 = "ctx.strokeStyle = \ngba(180,60,60,${alpha.toFixed(3)});"
new2 = "ctx.strokeStyle = `rgba(180,60,60,${alpha.toFixed(3)})`;"
content = content.replace(old2, new2)

print("After fix 1:", content.count("gba(255,215,0,"))
print("After fix 2:", content.count("gba(180,60,60,"))

with open(r"C:\Users\julie\.openclaw\workspace\haize\simulation.js", "w", encoding="utf-8") as f:
    f.write(content)
print("Done")
