import { game_instance } from ".";

export interface Moon {
	draw(ctx : CanvasRenderingContext2D) : void;
	is_point_lit(x : number, y : number) : boolean;
	get_moon_vector(x : number, y : number) : [number,number];
}

export class OrthoMoon implements Moon {
	ray_x : number; ray_y : number;
	constructor(ray_x = 0.32, ray_y = 1) {
		this.ray_x = ray_x; this.ray_y = ray_y;
	}
	get_moon_vector(x: number, y: number): [number, number] {
		return [-this.ray_x, -this.ray_y];
	}
	draw(ctx: CanvasRenderingContext2D): void {
		let inv_dist = 1/Math.sqrt(this.ray_x*this.ray_x+this.ray_y*this.ray_y);
		this.ray_x *= inv_dist;
		this.ray_y *= inv_dist;

		let right_x = this.ray_y;
		let right_y = -this.ray_x;
		let samples : Set<number> = new Set();
		let lines : number[][] = [];
		for(let line of game_instance.lines) {
			let p1 = right_x*line.x1 + right_y*line.y1;
			let p2 = right_x*line.x2 + right_y*line.y2;
			let o1 = this.ray_x*line.x1 + this.ray_y*line.y1;
			let o2 = this.ray_x*line.x2 + this.ray_y*line.y2;
			if(p2 <= p1) continue;
			samples.add(p1);
			samples.add(p2);
			samples.add(p1+0.1);
			samples.add(p2+0.1);
			samples.add(p1-0.1);
			samples.add(p2-0.1);
			lines.push([p1, o1, p2, o2, (o2-o1)/(p2-p1)]);
		}
		samples.add(-6000)
		samples.add(6000)
		let sorted_samples = [...samples].sort((a, b) => a-b);
		ctx.fillStyle = "#333333";
		ctx.globalCompositeOperation = "lighter";
		ctx.beginPath();
		//ctx.moveTo(0, 0);
		let is_first = true;
		let last_x=0, last_y=0;
		for(let sample of sorted_samples) {
			let min_y = 6000;
			for(let [x1, y1, x2, y2, slope] of lines) {
				if(x1 > sample || x2 < sample) continue;
				let y = (sample-x1) * slope + y1;
				if(y < min_y) min_y = y;
			}
			if(min_y != Infinity) {
				last_x = min_y * this.ray_x + right_x * sample;
				last_y = min_y * this.ray_y + right_y * sample;
				if(is_first) {
					ctx.moveTo(last_x - this.ray_x*12000, last_y - this.ray_y*12000);
					is_first = false;
				}
				ctx.lineTo(last_x, last_y);
			}
		}
		ctx.lineTo(last_x - this.ray_x*12000, last_y - this.ray_y*12000);
		ctx.closePath();
		ctx.fill();
		ctx.globalCompositeOperation = "source-over";
	}
	is_point_lit(x: number, y: number): boolean {
		
		for(let line of game_instance.lines) {
			if(line.instersect_ray(x, y, -this.ray_x, -this.ray_y) !== null) {
				//if(game_instance.arrow_down) {game_instance.lines.splice(game_instance.lines.indexOf(line), 1); game_instance.arrow_down = false;}
				return false;
			}
		}
		return true;
	}

}
