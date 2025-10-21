from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

SCOPES = [
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/spreadsheets"
]

def main():
    flow = InstalledAppFlow.from_client_secrets_file(
        "oauth_credentials.json", SCOPES
    )
    creds = flow.run_local_server(port=0)

    # Simpan token agar tidak login ulang setiap kali
    with open("token.json", "w") as token:
        token.write(creds.to_json())

    print("✅ Login berhasil! Token disimpan di token.json")

if __name__ == "__main__":
    main()
