#!/bin/bash
set -e

echo "🚀 Starting release process..."

# Check if we're on main branch
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$CURRENT_BRANCH" != "main" ]; then
    echo "❌ Error: You must be on the main branch to create a release"
    exit 1
fi

# Check for uncommitted changes
if [ -n "$(git status --porcelain)" ]; then
    echo "❌ Error: You have uncommitted changes. Please commit or stash them first."
    exit 1
fi

# Push main if needed
echo "📤 Pushing main branch..."
git push origin main

# Build the plugin
echo "🔨 Building plugin..."
pnpm run build

# Get current version from package.json
CURRENT_VERSION=$(jq -r .version package.json)
echo "📦 Current version: $CURRENT_VERSION"

# Bump version by 0.1 using node
NEW_VERSION=$(node -e "
const version = '$CURRENT_VERSION';
const parts = version.split('.');
if (parts.length === 2) {
  // Format: 0.2 -> 0.3
  parts[1] = String(Number(parts[1]) + 1);
} else if (parts.length === 3) {
  // Format: 0.1.2 -> 0.1.3
  parts[2] = String(Number(parts[2]) + 1);
}
console.log(parts.join('.'));
")

echo "⬆️  Bumping version to: $NEW_VERSION"

# Update package.json version
npm version $NEW_VERSION --no-git-tag-version

# Run the version-bump script (updates manifest.json and versions.json)
echo "📝 Updating manifest and versions..."
pnpm run version

# Commit version bump
echo "💾 Committing version bump..."
git add package.json manifest.json versions.json
git commit -m "Bump version to $NEW_VERSION"
git push origin main

# Create and push tag
echo "🏷️  Creating tag $NEW_VERSION..."
git tag -a $NEW_VERSION -m "Release $NEW_VERSION"
git push origin $NEW_VERSION

# Create GitHub release with attachments
echo "🎉 Creating GitHub release..."
gh release create $NEW_VERSION \
  --title "Release $NEW_VERSION" \
  --generate-notes \
  main.js manifest.json styles.css

echo "✅ Release $NEW_VERSION created successfully!"
echo "🔗 View at: https://github.com/$(git config --get remote.origin.url | sed 's/.*github.com[:/]\(.*\)\.git/\1/')/releases/tag/$NEW_VERSION"
