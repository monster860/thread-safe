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
	text?: TiledText;
	x : number;
	y : number;
	width : number;
	height : number;
}

export type TiledPoint = {
	x:number; y:number;
}

export type TiledText = {
	color: string;
	text: string;
	wrap: boolean;
}

export type TiledLayer = {
	objects? : TiledObject[];
	name : string;
	data? : number[];
	width? : number;
	height? : number;
	properties? : TiledProperty[];
}