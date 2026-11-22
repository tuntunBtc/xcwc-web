'use strict';

const VIDEO_WIDTH = 0.48;
const VIDEO_CENTER_Y = VIDEO_WIDTH / 2;

function createWhiteKeyEffect(scene, xr) {
    return scene.createEffect({
        name: 'nest-video-white-key',
        images: [{ key: 'u_videoMap', default: 'white', macro: 'WX_USE_VIDEOMAP' }],
        defaultRenderQueue: 3000,
        passes: [{
            lightMode: 'ForwardBase',
            useMaterialRenderStates: true,
            renderStates: {
                cullOn: false,
                depthWrite: false,
                blendOn: true,
                blendSrc: xr.EBlendFactor.SRC_ALPHA,
                blendDst: xr.EBlendFactor.ONE_MINUS_SRC_ALPHA,
            },
            shaders: [0, 1],
        }],
        shaders: [
            `#version 100
uniform highp mat4 u_world;
uniform highp mat4 u_view;
uniform highp mat4 u_projection;
attribute vec3 a_position;
attribute highp vec2 a_texCoord;
varying highp vec2 v_UV;

void main() {
    v_UV = a_texCoord;
    gl_Position = u_projection * u_view * u_world * vec4(a_position, 1.0);
}`,
            `#version 100
precision mediump float;
varying highp vec2 v_UV;

#ifdef WX_USE_VIDEOMAP
uniform sampler2D u_videoMap;

float keyAlpha(vec3 color) {
    float whiteDistance = length(vec3(1.0) - color) * 0.577350269;
    return smoothstep(0.075, 0.15, whiteDistance);
}
#endif

void main() {
#ifdef WX_USE_VIDEOMAP
    vec3 color = texture2D(u_videoMap, v_UV).rgb;
    float alpha = keyAlpha(color);
    if (alpha <= 0.001) discard;
    // Recover the foreground color before tightening coverage near the contour.
    color = clamp((color - vec3(1.0 - alpha)) / alpha, 0.0, 1.0);
    // The current playback texture is 960 × 960. Leave a soft fringe of fur.
    const float edge = 3.0 / 960.0;
    float inner = min(keyAlpha(texture2D(u_videoMap, v_UV + vec2(edge, 0.0)).rgb),
                      keyAlpha(texture2D(u_videoMap, v_UV - vec2(edge, 0.0)).rgb));
    inner = min(inner, keyAlpha(texture2D(u_videoMap, v_UV + vec2(0.0, edge)).rgb));
    inner = min(inner, keyAlpha(texture2D(u_videoMap, v_UV - vec2(0.0, edge)).rgb));
    alpha = mix(alpha, min(alpha, inner), 0.78);
    // XR-Frame's post-processor expects linear RGB. Direct rendering uses the video's display RGB.
#ifdef WX_PP_ACTIVE
    color = pow(color, vec3(2.2));
#endif
    gl_FragData[0] = vec4(color, alpha);
#else
    discard;
#endif
}`,
        ],
    });
}

Component({
    properties: { models: Array, videoUrl: String },
    lifetimes: {
        detached() {
            this.pauseVideo();
            try { this.scene?.assets?.releaseAsset?.('video-texture', 'nest-video'); } catch { /* Scene already disposed. */ }
            this.scene = null;
            this.birds = null;
            this.video = null;
            this.videoTransform = null;
            this.videoScale = 1;
            this.meshesReady = false;
        },
    },
    methods: {
        async onReady(event) {
            const scene = this.scene = event.detail.value;
            if (this.data.videoUrl) {
                await this.loadVideo(scene);
                return;
            }
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
        async loadVideo(scene) {
            try {
                const { value: video } = await scene.assets.loadAsset({
                    type: 'video-texture', assetId: 'nest-video', src: this.data.videoUrl,
                    options: { autoPlay: false, loop: true },
                });
                if (this.scene !== scene) {
                    try { await video?.pause(); } catch { /* Scene already disposed. */ }
                    try { scene.assets.releaseAsset?.('video-texture', 'nest-video'); } catch { /* Already released. */ }
                    return;
                }
                if (!video?.texture) throw new Error('视频纹理未就绪');
                const xr = wx.getXrFrameSystem();
                const effect = createWhiteKeyEffect(scene, xr);
                const material = scene.createMaterial(effect, { u_videoMap: video.texture });
                scene.assets.addAsset('material', 'nest-video-material', material);
                const plane = scene.createElement(xr.XRMesh, {
                    geometry: 'plane', material: 'nest-video-material', position: `0 ${VIDEO_CENTER_Y} 0`,
                    rotation: '90 0 0', scale: `${VIDEO_WIDTH} 1 ${VIDEO_WIDTH}`, states: 'cullOn:false',
                });
                scene.getElementById('birds').addChild(plane);
                this.videoTransform = plane.getComponent(xr.Transform);
                if (!this.videoTransform) throw new Error('视频平面未就绪');
                this.videoScale = 1;
                this.video = video;
                this.meshesReady = true;
                this.triggerEvent('modelsloaded');
            } catch (error) {
                if (this.scene !== scene) return;
                console.warn('Nest AR video could not load', error?.message);
                this.triggerEvent('arfailure', { kind: 'video' });
            }
        },
        async resumeVideo() {
            const video = this.video;
            if (!video || this.videoShouldPlay) return;
            this.videoShouldPlay = true;
            const attempt = this.videoPlayAttempt = {};
            try {
                await video.play();
                // A native play request can finish after the page has already paused it.
                if (this.video === video && !this.videoShouldPlay) await this.pauseVideo();
            } catch (error) {
                if (this.video !== video || this.videoPlayAttempt !== attempt) return;
                this.videoShouldPlay = false;
                this.videoPlayAttempt = null;
                console.warn('Nest AR video could not play', error?.errMsg || error?.message);
                this.triggerEvent('arfailure', { kind: 'video' });
            }
        },
        async pauseVideo() {
            this.videoShouldPlay = false;
            this.videoPlayAttempt = null;
            try { await this.video?.pause(); } catch { /* The native scene may already be paused. */ }
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
            this.resumeVideo();
            return true;
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
            const height = this.videoTransform ? VIDEO_CENTER_Y * this.videoScale : 0.1;
            const world = new xr.Vector3();
            const clip = new xr.Vector3();
            const project = (x, z) => {
                world.setValue(x, height, z).applyMatrix4(group.worldMatrix);
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
            const xLengthSquared = ax * ax + ay * ay;
            const zLengthSquared = bx * bx + by * by;
            const spread = xLengthSquared + zLengthSquared;
            if (!Number.isFinite(spread) || spread < 1) return undefined;
            const minDeterminant = Math.max(1, spread * 0.1);
            if (Math.abs(determinant) < minDeterminant) {
                // Preserve visible motion without amplifying drag along a foreshortened axis.
                const damping = (minDeterminant ** 2 - determinant ** 2) / spread;
                const cross = ax * bx + ay * by;
                const xTarget = ax * dx + ay * dy;
                const zTarget = bx * dx + by * dy;
                const denominator = determinant ** 2 + damping * (spread + damping);
                return {
                    x: position.x + sample * (xTarget * (zLengthSquared + damping) - zTarget * cross) / denominator,
                    z: position.z + sample * (zTarget * (xLengthSquared + damping) - xTarget * cross) / denominator,
                };
            }
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
        moveVideo(x, z) {
            if (!this.videoTransform) return false;
            this.videoTransform.position.setValue(x, VIDEO_CENTER_Y * this.videoScale, z);
            return true;
        },
        zoom(scale) {
            if (this.videoTransform) {
                const { position, scale: size } = this.videoTransform;
                size.setValue(VIDEO_WIDTH * scale, 1, VIDEO_WIDTH * scale);
                this.videoScale = scale;
                return this.moveVideo(position.x, position.z);
            }
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
        async savePhoto() {
            const share = this.scene?.share;
            if (!share?.supported || typeof share.captureToLocalPath !== 'function'
                || typeof wx.saveImageToPhotosAlbum !== 'function') return false;
            // XR owns the temp file and releases it once this callback finishes.
            await share.captureToLocalPath({ fileType: 'jpg', quality: 0.92 }, filePath =>
                new Promise((resolve, reject) => {
                    wx.saveImageToPhotosAlbum({ filePath, success: resolve, fail: reject });
                }));
            return true;
        },
    },
});
