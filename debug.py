print("script started")

with open('app.py', 'rb') as f:
    content = f.read()

print("file size:", len(content))
print("first 100 bytes:", content[:100])

print("about to exec app.py")
exec(content.decode('utf-8'))
print("exec finished")