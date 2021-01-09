import { game_instance } from ".";

export class Sound {
	buffer : AudioBuffer|null = null;
	constructor(url : string) {
		fetch(url).then(async res => {
			let buf = await res.arrayBuffer();
			game_instance.audio_ctx.decodeAudioData(buf, buf => {
				this.buffer = buf;
			}, err => {
				console.error(err);
			})
		});
	}
	play(speed = 1) {
		if(!this.buffer) return;
		let source = game_instance.audio_ctx.createBufferSource();
		source.buffer = this.buffer;
		source.connect(game_instance.audio_ctx.destination);
		source.playbackRate.value = speed;
		source.start();
	}
}