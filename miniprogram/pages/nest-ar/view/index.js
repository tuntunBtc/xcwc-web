'use strict';

Component({
    properties: { models: Array },
    lifetimes: {
        detached() {
            this.scene = null;
            this.birds = null;
            this.meshesReady = false;
        },
    },
    methods: {
        async onReady(event) {
            const scene = this.scene = event.detail.value;
            try {
                const xr = wx.getXrFrameSystem();
                const root = scene.getElementById('birds');
                const birds = new Map();
                const assets = await Promise.all(this.data.models.map(async model => {
                    try {
                        const result = await scene.assets.loadAsset({ type: 'gltf', assetId: model.key, src: model.src });
                        if (!result?.value) throw new Error('模型加载失败：' + model.key);
                        return { model, value: result.value };
                    } catch (error) {
                        throw Object.assign(new Error(error?.message || '模型读取失败'), { model });
                    }
                }));
                if (this.scene !== scene) return;
                for (const { model, value } of assets) {
                    const element = scene.createElement(xr.XRGLTF);
                    root.addChild(element);
                    const transform = element.getComponent(xr.Transform);
                    transform.position.setValue(model.x, 0.1, model.z);
                    const gltf = element.getComponent(xr.GLTF);
                    try {
                        gltf.setData({ model: value });
                    } catch (error) {
                        throw Object.assign(new Error(error?.message || '模型挂载失败'), { model });
                    }
                    birds.set(model.key, { transform, gltf });
                }
                this.birds = birds;
            } catch (error) {
                if (this.scene !== scene) return;
                console.warn('Nest AR XR model load failed', error?.message || String(error));
                if (error.model) {
                    this.triggerEvent('arfailure', { kind: 'model', key: error.model.key, src: error.model.src });
                } else {
                    this.onError();
                }
            }
        },
        onTick() {
            if (this.meshesReady || !this.birds?.size || this.birds.size !== this.data.models.length) return;
            for (const { gltf } of this.birds.values()) {
                if (!gltf.meshes.length) return;
            }
            this.meshesReady = true;
            this.triggerEvent('modelsloaded');
        },
        onARReady() { this.triggerEvent('tracking'); },
        onPlaneState({ detail }) {
            const { state, errorMessage } = detail.value || {};
            if (state === 3) {
                console.warn('Nest AR plane tracker failed', errorMessage);
                this.triggerEvent('arfailure', { kind: 'tracking' });
                return;
            }
            this.triggerEvent('plane', { ready: state === 2 });
        },
        onError() { this.triggerEvent('arfailure'); },
        place() {
            const flock = this.scene?.getNodeById('flock');
            if (!this.meshesReady || !flock || !this.scene.ar.placeHere('flock', true)) return false;
            flock.visible = true;
            this.setMarkerVisible(false);
            return true;
        },
        reset() {
            if (!this.scene) return;
            const flock = this.scene.getNodeById('flock');
            if (flock) flock.visible = false;
            this.scene.ar.resetPlane();
            this.setMarkerVisible(true);
        },
        setMarkerVisible(visible) {
            const marker = this.scene?.getNodeById('plane-marker');
            if (marker) marker.visible = visible;
        },
        dragPosition(position, dx, dy, viewport) {
            const xr = wx.getXrFrameSystem();
            const scene = this.scene;
            const group = scene?.getNodeById('birds');
            const camera = scene?.getElementById('camera')?.getComponent(xr.Camera);
            if (!group || !camera) return undefined;
            const sample = 0.05;
            const world = new xr.Vector3();
            const clip = new xr.Vector3();
            const project = (x, z) => {
                world.setValue(x, 0.1, z).applyMatrix4(group.worldMatrix);
                camera.convertWorldPositionToClip(world, clip);
                return [clip.x * viewport.windowWidth / 2, -clip.y * viewport.windowHeight / 2];
            };
            const [ox, oy] = project(position.x, position.z);
            const [xx, xy] = project(position.x + sample, position.z);
            const [zx, zy] = project(position.x, position.z + sample);
            const ax = xx - ox;
            const ay = xy - oy;
            const bx = zx - ox;
            const by = zy - oy;
            const determinant = ax * by - ay * bx;
            if (!Number.isFinite(determinant) || Math.abs(determinant) < 1) return undefined;
            return {
                x: position.x + sample * (dx * by - dy * bx) / determinant,
                z: position.z + sample * (ax * dy - ay * dx) / determinant,
            };
        },
        move(key, x, z) {
            const transform = this.birds?.get(key)?.transform;
            if (!transform) return false;
            transform.position.setValue(x, 0.1, z);
            return true;
        },
        zoom(scale) {
            const transform = this.scene?.getNodeById('birds');
            if (!transform) return false;
            transform.scale.setValue(scale, scale, scale);
            return true;
        },
        async capture() {
            const share = this.scene?.share;
            if (!share?.supported) return false;
            await share.captureToFriends({ fileType: 'jpg', quality: 0.9 });
            return true;
        },
    },
});
