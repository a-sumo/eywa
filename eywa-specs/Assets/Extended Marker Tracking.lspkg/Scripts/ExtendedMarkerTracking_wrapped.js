function scriptBody(script){ 
// -----JS CODE-----
// When using Spectacles (2021), you should track marker only once, 
// and detach the marker on found to performance


if (!script.markerComponent) {
    print("Please assign a marker component to track");
    return;
}

// Get info about object to track
var objectT;
var originalPos; 
var originalRot; 
var originalScale; 

function parentChildrenToParent(childrenParent) {
    var parentMarkerChildren = global.scene.createSceneObject("parentMarkerChildren");
    var children = [];
    
    // Parent every children of marker to a parent that we can move around easily
    for ( var i = 0; i < childrenParent.getChildrenCount(); i++) {
        var child = childrenParent.getChild(i);
        children.push(child)
    }
    children.forEach(function(d) {d.setParent(parentMarkerChildren)})
    
    parentMarkerChildren.setParent(childrenParent);
    
    return parentMarkerChildren;
}


function enableChildren(objectContainer) {
    for (var i = 0; i < objectContainer.getChildrenCount(); i++) {
        objectContainer.getChild(i).enabled = true;
    }
    print("Enabled " + objectContainer.getChildrenCount() + " marker children");
}

function detachMarker(objectContainer, parent) {
    objectT = objectContainer.getTransform();

    objectT.getWorldPosition();
    objectContainer.setParentPreserveWorldTransform(parent);
    enableChildren(objectContainer);

    print("Detached from Marker!");
}

function attachMarker(objectContainer, parent) {
    var objectT = objectContainer.getTransform();
    
    objectContainer.setParent(parent);
    
    objectT.setLocalPosition(originalPos);
    objectT.setLocalRotation(originalRot);
    objectT.setLocalScale(originalScale);
    
    print("Attached to Marker!");
}

function disableMarkerTracking () {
    script.markerComponent.enabled = false;
    print("Marker Disabled!");
}


function init() {

    // Parent for when object should be detached
    var freeParent = script.getSceneObject();

    // Parent for when object should be attached to marker
    var markerParent = script.markerComponent.getSceneObject();

    // Create a parent for everything under marker that we can parent to a free parent
    var objectContainer = parentChildrenToParent(markerParent);

    // Keep information about the original transform that we can apply back later
    var objectT = objectContainer.getTransform();
    originalPos = objectT.getLocalPosition();
    originalRot = objectT.getLocalRotation();
    originalScale = objectT.getLocalScale();

    // Choose when we should detach object from marker
    var detachEvent = script.trackMarkerOnce && script.detachOnFound ?
        "onMarkerFound" : "onMarkerLost";

    // Guard against false positive on first frame - ignore detections in first 2s
    var startTime = getTime();
    var ready = false;
    var autoDetached = false;
    var markerEverFound = false;

    script.createEvent("UpdateEvent").bind(function() {
        if (!ready && getTime() - startTime > 2.0) {
            ready = true;
            print("[Eywa] Marker tracking armed (2s warmup done)");
        }

        // Auto-detach after 3s if no marker detected (default placement mode)
        if (ready && !autoDetached && !markerEverFound && getTime() - startTime > 3.0) {
            autoDetached = true;
            print("[Eywa] No marker after 3s, auto-detaching to default position");
            detachMarker(objectContainer, freeParent);
            // Keep marker tracking enabled so it can reposition later
        }
    });

    // Log marker found
    script.markerComponent.onMarkerFound = wrapFunction(
        script.markerComponent.onMarkerFound,
        function() { print("[Eywa] Marker detected" + (ready ? " - ACCEPTED" : " - IGNORED (warmup)")); }
    );

    // Guarded detach - only fires after warmup
    function guardedDetach() {
        if (!ready) {
            print("[Eywa] Skipping detach during warmup");
            return;
        }
        markerEverFound = true;

        if (autoDetached) {
            // Already detached to default position. Reposition to marker.
            var markerT = script.markerComponent.getSceneObject().getTransform();
            objectContainer.getTransform().setWorldPosition(markerT.getWorldPosition());
            objectContainer.getTransform().setWorldRotation(markerT.getWorldRotation());
            print("[Eywa] Repositioned from default to marker location");
        } else {
            detachMarker(objectContainer, freeParent);
        }
    }

    // When marker found/lost, detach to world (guarded)
    script.markerComponent[detachEvent] = wrapFunction(
        script.markerComponent[detachEvent],
        guardedDetach
    );

    // If we only want to track the marker once then rely on World tracking,
    // don't re-attach on marker found and disable marker component
    if (script.trackMarkerOnce) {
        script.markerComponent[detachEvent] = wrapFunction(
            script.markerComponent[detachEvent],
            function() {
                if (ready) disableMarkerTracking();
            }
        );
    } else {
        script.markerComponent.onMarkerFound = wrapFunction(
            script.markerComponent.onMarkerFound,
            attachMarker.bind(this, objectContainer, markerParent)
        );
    }


}

init();

// Helper: Allow behavior and others to bind to event as well
function wrapFunction(origFunc, newFunc) {
    if (!origFunc) {
        return newFunc;
    }
    return function() {
        origFunc();
        newFunc();
    };
}

 }; module.exports = scriptBody;