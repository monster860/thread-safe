export type TiledProperty = {
	name : string,
	type : string,
	value : string|number|boolean
};

export type TiledMap = {
	layers : TiledLayer[]
};

export type TiledObject = {
	polygon? : TiledPoint[];
	polyline? : TiledPoint[];
	type : string;
	properties? : TiledProperty[];
	x : number;
	y : number;
}

export type TiledPoint = {
	x:number; y:number;
}

export type TiledLayer = {
	objects? : TiledObject[];
	name : string;
	data? : number[];
	width? : number;
	height? : number;
}