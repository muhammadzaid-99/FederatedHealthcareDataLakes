from pynessie import NessieClient

# Initialize the client with your Nessie server URL
client = NessieClient("http://localhost:19120/api/v1")

# List all references (branches and tags)
refs = client.list_references()
for ref in refs:
    print(ref.name, ref.hash)

# Get the commit log for a specific branch
log = client.get_log("main")
for commit in log:
    print(commit)

# List all contents (tables)
contents = client.list_contents(ref="main")
for content in contents:
    print(content)