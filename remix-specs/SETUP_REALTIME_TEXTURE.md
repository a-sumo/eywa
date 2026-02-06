# Realtime Texture Setup for Spectacles

Follow these steps to get live texture streaming working in your Spectacles project.

## Quick Start (5 minutes)

### Step 1: Open Lens Studio
Open your `remix-specs` project in Lens Studio.

### Step 2: Create SupabaseProject Asset
1. Go to **Window > Supabase**
2. Login to the Supabase plugin
3. Click **Import Credentials**
4. This creates a "SupabaseProject" asset in your Asset Browser
5. Note where it appears (usually in Assets root)

### Step 3: Setup SnapCloudRequirements
1. In your scene hierarchy, find or create an object called "CloudManager" or similar
2. Add the **SnapCloudRequirements** script component to it
3. In the Inspector, drag the **SupabaseProject** asset into the `supabaseProject` field

### Step 4: Add RealtimePanel
1. Create a new empty SceneObject (right-click in hierarchy > Create New > Empty)
2. Rename it to "RealtimePanel"
3. Add the **RealtimePanel** script component to it
4. Configure in Inspector:
   - **Snap Cloud Requirements**: Drag your CloudManager object here
   - **Channel Name**: Enter your room slug (e.g., "demo")
   - **Panel Width**: 40 (or adjust as needed)
   - **Panel Height**: 40
   - **Show Status**: ✓ (checked)

### Step 5: Position the Panel
- Move the RealtimePanel object in the scene where you want it to appear
- It will display relative to this object's transform
- Try: Position at (0, 0, -100) to place it in front of the camera

### Step 6: Test!

**In Web Browser:**
1. Open your Eywa web app
2. Go to `/r/demo/spectacles` (or your room slug)
3. Click **Broadcast** button
4. Wait for "◉ Live" status
5. You should see the UI rendering in the canvas

**In Spectacles:**
1. Open Lens Studio Preview (or push to device)
2. Check console for:
   ```
   [RealtimePanel] Initializing...
   [RealtimeTextureReceiver] awakening...
   [RealtimeTextureReceiver] Subscribed to realtime channel!
   [RealtimeTextureReceiver] Received frame #10
   ```
3. Look for the quad displaying the streamed texture!

## Troubleshooting

### "SnapCloudRequirements not configured"
- Make sure you assigned the SupabaseProject asset
- Check that the SupabaseProject has valid URL and token

### "Channel closed or error occurred"
- Verify Supabase project allows realtime connections
- Check channel name matches between web and Spectacles

### No texture appearing
- Confirm web broadcaster shows "◉ Live"
- Check console for "Received frame" messages
- Verify channel name is correct on both sides

### Console shows errors about Material or Texture
- This is usually fine - textures decode asynchronously
- Wait a few seconds for first frame to appear

## Next Steps

### Integration with RemixPanel
To display the texture **behind** your existing RemixPanel:
1. Parent RealtimePanel to your scene root
2. Position it at Z = -50 (behind the panel)
3. Scale it larger to act as a background display

### Interactive Overlay
To make the texture interactive:
1. Add ColliderComponent to the RealtimeQuad object
2. Add InteractionComponent for tap/pinch detection
3. Forward events to web via Supabase broadcast

### Performance Tuning
Adjust in SpectaclesView.tsx:
```typescript
const broadcastInterval = 1000 / 10; // 10fps (line 501)
```
- Lower = less bandwidth, lower frame rate
- Higher = more bandwidth, smoother
- 10fps is a good default for UI streaming

## Alternative: Use with Image Tracker

To anchor the texture to a physical marker:
1. Add MarkerTrackingComponent to RealtimePanel object
2. Import your marker image and assign it
3. Position panel relative to marker
4. The texture will appear when marker is detected

## Architecture

```
Scene Hierarchy:
├── CloudManager (SnapCloudRequirements)
├── Camera
└── RealtimePanel (RealtimePanel script)
    ├── RealtimeQuad (RenderMeshVisual + RealtimeTextureReceiver)
    └── StatusText (Text component)
```

Data Flow:
```
Web (SpectaclesView) 
  → Supabase Realtime Channel "spectacles:demo"
  → Spectacles (RealtimeTextureReceiver)
  → Base64 decode
  → Texture
  → Material.mainPass.baseTex
  → Quad renders
```

## Performance Tips

1. **Lower canvas resolution** in SpectaclesView.tsx (line 13-14):
   ```typescript
   const FRAME_WIDTH = 256;  // Down from 512
   const FRAME_HEIGHT = 256;
   ```

2. **Reduce JPEG quality** (line 483):
   ```typescript
   const base64 = canvas.toDataURL("image/jpeg", 0.5); // Down from 0.7
   ```

3. **Throttle broadcasts** when no changes occur

4. **Use conditional rendering**: Only broadcast when data changes

