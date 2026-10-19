import subprocess
import urllib.request
import json
import sys

def get_token():
    p = subprocess.Popen(['git', 'credential', 'fill'], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    out, _ = p.communicate('protocol=https\nhost=github.com\n\n')
    creds = dict(line.split('=', 1) for line in out.splitlines() if '=' in line)
    return creds.get('password')

def create_and_merge_pr(branch: str, title: str, body: str):
    token = get_token()
    headers = {
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json',
        'User-Agent': 'CompassAgent'
    }

    # 1. Create Pull Request
    payload = json.dumps({
        'title': title,
        'head': branch,
        'base': 'main',
        'body': body
    }).encode('utf-8')

    req = urllib.request.Request(
        'https://api.github.com/repos/Ratnesh-101/compass/pulls',
        data=payload,
        headers=headers
    )
    with urllib.request.urlopen(req) as resp:
        pr_data = json.loads(resp.read().decode('utf-8'))
        pr_num = pr_data['number']
        pr_url = pr_data['html_url']
        print(f"Created PR #{pr_num}: {pr_url}")

    # 2. Merge Pull Request using standard merge commit so all commits are preserved on main's heatmap
    merge_payload = json.dumps({
        'commit_title': f"Merge pull request #{pr_num} from Ratnesh-101/{branch}",
        'commit_message': title,
        'merge_method': 'merge'
    }).encode('utf-8')

    req_merge = urllib.request.Request(
        f"https://api.github.com/repos/Ratnesh-101/compass/pulls/{pr_num}/merge",
        data=merge_payload,
        method='PUT',
        headers=headers
    )
    with urllib.request.urlopen(req_merge) as resp:
        merge_data = json.loads(resp.read().decode('utf-8'))
        print(f"Successfully merged PR #{pr_num}: merged={merge_data.get('merged')}, sha={merge_data.get('sha', '')[:8]}")

if __name__ == '__main__':
    branch = sys.argv[1]
    title = sys.argv[2]
    body = sys.argv[3]
    create_and_merge_pr(branch, title, body)
