/**
 * ImageTracker.ts
 * Tracks the e-ink display marker and anchors the RemixPanel to it.
 *
 * Setup in Lens Studio:
 * 1. Add a Marker Tracking component to an object
 * 2. Import the tracking marker image and assign it to the component
 * 3. Add this script to the same object
 * 4. Assign the RemixPanel prefab/object to panelObject
 */

@component
export class ImageTracker extends BaseScriptComponent {
    /** The RemixPanel object to show when marker is tracked */
    @input
    panelObject: SceneObject;

    /** Offset from marker center (cm) - panel floats above/beside the display */
    @input
    offsetX: number = 0;
    @input
    offsetY: number = 15; // Float 15cm above
    @input
    offsetZ: number = 0;

    /** Scale multiplier for the panel */
    @input
    panelScale: number = 1.0;

    /** Smoothing factor for position (0-1, higher = smoother but more lag) */
    @input
    smoothing: number = 0.8;

    private markerTracking: MarkerTrackingComponent;
    private isTracking: boolean = false;
    private targetPosition: vec3;
    private targetRotation: quat;

    onAwake(): void {
        // Deferred init - components not ready on frame 0
        this.createEvent("OnStartEvent").bind(() => this.init());
    }

    private init(): void {
        // Find the marker tracking component on this object
        this.markerTracking = this.sceneObject.getComponent("Component.MarkerTrackingComponent");

        if (!this.markerTracking) {
            print("ImageTracker: No MarkerTrackingComponent found on this object");
            return;
        }

        if (!this.panelObject) {
            print("ImageTracker: No panelObject assigned");
            return;
        }

        // Initially hide the panel
        this.panelObject.enabled = false;

        // Set up tracking callbacks
        this.markerTracking.onMarkerFound = () => this.onMarkerFound();
        this.markerTracking.onMarkerLost = () => this.onMarkerLost();

        // Update loop for smooth following
        this.createEvent("UpdateEvent").bind(() => this.onUpdate());

        print("ImageTracker: Initialized, waiting for marker...");
    }

    private onMarkerFound(): void {
        print("ImageTracker: Marker found!");
        this.isTracking = true;
        this.panelObject.enabled = true;

        // Initialize position immediately on first detection
        this.updateTargetTransform();
        this.applyTransformImmediate();
    }

    private onMarkerLost(): void {
        print("ImageTracker: Marker lost");
        this.isTracking = false;
        // Keep panel visible but stop updating position
        // This prevents flickering when tracking momentarily lost
    }

    private onUpdate(): void {
        if (!this.isTracking || !this.markerTracking) return;

        this.updateTargetTransform();
        this.applyTransformSmooth();
    }

    private updateTargetTransform(): void {
        // Get marker world transform
        const markerTransform = this.sceneObject.getTransform();
        const markerPos = markerTransform.getWorldPosition();
        const markerRot = markerTransform.getWorldRotation();

        // Calculate offset in marker's local space
        const offset = new vec3(this.offsetX, this.offsetY, this.offsetZ);
        const worldOffset = markerRot.multiplyVec3(offset);

        this.targetPosition = markerPos.add(worldOffset);
        this.targetRotation = markerRot;
    }

    private applyTransformImmediate(): void {
        const panelTransform = this.panelObject.getTransform();
        panelTransform.setWorldPosition(this.targetPosition);
        panelTransform.setWorldRotation(this.targetRotation);
        panelTransform.setLocalScale(new vec3(this.panelScale, this.panelScale, this.panelScale));
    }

    private applyTransformSmooth(): void {
        const panelTransform = this.panelObject.getTransform();
        const currentPos = panelTransform.getWorldPosition();
        const currentRot = panelTransform.getWorldRotation();

        // Lerp position
        const newPos = vec3.lerp(currentPos, this.targetPosition, 1 - this.smoothing);
        panelTransform.setWorldPosition(newPos);

        // Slerp rotation
        const newRot = quat.slerp(currentRot, this.targetRotation, 1 - this.smoothing);
        panelTransform.setWorldRotation(newRot);
    }

    /**
     * Call this to temporarily hide the panel (e.g., when user dismisses it)
     */
    hidePanel(): void {
        this.panelObject.enabled = false;
    }

    /**
     * Call this to show the panel again (if currently tracking)
     */
    showPanel(): void {
        if (this.isTracking) {
            this.panelObject.enabled = true;
        }
    }

    /**
     * Check if currently tracking the marker
     */
    getIsTracking(): boolean {
        return this.isTracking;
    }
}
