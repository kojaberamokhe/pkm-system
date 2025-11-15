# Uploading to GitHub - Step by Step Guide

## Prerequisites
- A GitHub account (create one at https://github.com if you don't have one)
- Git installed on your computer (usually comes with macOS/Linux, or download from https://git-scm.com)

## Step 1: Create a GitHub Repository

1. Go to https://github.com and sign in
2. Click the **"+"** icon in the top right corner
3. Select **"New repository"**
4. Fill in the details:
   - **Repository name**: `pkm-system` (or any name you prefer)
   - **Description**: "Personal Knowledge Management system with flashcards and spaced repetition"
   - **Visibility**: Choose **Public** (if you want to share) or **Private** (if you want to keep it private)
   - **DO NOT** check "Initialize with README" (we already have one)
   - **DO NOT** add .gitignore or license (we already have them)
5. Click **"Create repository"**

## Step 2: Connect Your Local Repository to GitHub

After creating the repository, GitHub will show you commands. Use these:

```bash
# Make sure you're in the project directory
cd /Users/sogdi/pkm

# Add all files and make your first commit
git add .
git commit -m "Initial commit: PKM System with flashcards and spaced repetition"

# Add the GitHub repository as remote (replace YOUR_USERNAME with your GitHub username)
git remote add origin https://github.com/YOUR_USERNAME/pkm-system.git

# Push your code to GitHub
git branch -M main
git push -u origin main
```

**Note**: Replace `YOUR_USERNAME` with your actual GitHub username and `pkm-system` with your repository name if different.

## Step 3: Authentication

When you run `git push`, you'll be asked to authenticate:

### Option A: Personal Access Token (Recommended)
1. Go to GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Click "Generate new token (classic)"
3. Give it a name like "PKM System"
4. Select scopes: check `repo` (full control of private repositories)
5. Click "Generate token"
6. Copy the token (you won't see it again!)
7. When prompted for password, paste the token instead

### Option B: GitHub CLI (Easier)
```bash
# Install GitHub CLI (if not installed)
brew install gh

# Authenticate
gh auth login

# Then push normally
git push -u origin main
```

### Option C: SSH Key (Most Secure)
1. Generate SSH key: `ssh-keygen -t ed25519 -C "your_email@example.com"`
2. Add to GitHub: Settings → SSH and GPG keys → New SSH key
3. Use SSH URL: `git remote set-url origin git@github.com:YOUR_USERNAME/pkm-system.git`

## Step 4: Verify Upload

1. Go to your GitHub repository page
2. You should see all your files there!
3. The README.md will automatically display on the repository homepage

## Future Updates

Whenever you make changes, commit and push:

```bash
git add .
git commit -m "Description of your changes"
git push
```

## What Gets Uploaded

✅ **Included:**
- All source code (`src/`, `main.js`, `preload.js`)
- Configuration files (`package.json`, `vite.config.js`)
- Documentation (`README.md`, `ARCHITECTURE.md`, etc.)
- GitHub Actions workflow (`.github/workflows/build.yml`)

❌ **Excluded (via .gitignore):**
- `node_modules/` - Dependencies (can be reinstalled)
- `dist/` - Build output
- `release/` - Installer files
- `*.db` - Database files (your personal data)
- `.DS_Store` - macOS system files

## GitHub Actions (CI/CD)

Your repository includes a GitHub Actions workflow that will automatically build your app for Windows, macOS, and Linux whenever you push code!

To enable it:
1. Go to your repository on GitHub
2. Click "Actions" tab
3. The workflow will run automatically on push

## Making Your Repository Public

If you want to share your project:
1. Go to repository Settings
2. Scroll down to "Danger Zone"
3. Click "Change visibility"
4. Select "Make public"

## Adding a License

If you want to add a license:
1. Go to your repository on GitHub
2. Click "Add file" → "Create new file"
3. Name it `LICENSE`
4. GitHub will offer to add a license template - choose MIT or your preferred license

---

**That's it!** Your PKM System is now on GitHub! 🎉

